/** Reading photographs from Wikimedia Commons, for edit mode. */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_FILE_PATH =
  'https://commons.wikimedia.org/wiki/Special:FilePath/';

/** Width of the image shown in the profile and the gallery. */
export const COMMONS_DISPLAY_WIDTH = 1280;
/** Width of a thumbnail. Commons serves a fixed set of widths, and 330 is one. */
export const COMMONS_THUMB_WIDTH = 330;
/** Longest caption the database stores. */
export const CAPTION_MAX = 300;

/** Licences a photograph can be stored under, as in the `licences` table. */
export const IMAGE_LICENCES = [
  'cc0-1.0',
  'public-domain',
  'cc-by-2.0',
  'cc-by-2.5',
  'cc-by-3.0',
  'cc-by-4.0',
  'cc-by-sa-2.0',
  'cc-by-sa-2.5',
  'cc-by-sa-3.0',
  'cc-by-sa-4.0',
] as const;

/** File types a browser shows and the bucket accepts. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** What Commons says about one file. */
export interface CommonsFile {
  /** The file title, `File:…`, with spaces. */
  title: string;
  /** The file's page on Commons. */
  pageUrl: string;
  /** The original file, without tracking parameters. */
  fileUrl: string;
  width: number;
  height: number;
  creator: string;
  /** A licence id from `IMAGE_LICENCES`. */
  licenceId: string;
  /** The first part of the file's description, as plain text. */
  caption: string;
}

export type CommonsFileResult =
  | { status: 'ok'; file: CommonsFile }
  | { status: 'error'; message: string };

/**
 * A short licence label for a credit line.
 * @param id - A licence id, such as `cc-by-sa-4.0`.
 * @returns For example `CC BY-SA 4.0`, `CC0`, or `Public domain`.
 */
export function licenceShortName(id: string): string {
  if (id === 'public-domain') return 'Public domain';
  if (id === 'cc0-1.0') return 'CC0';
  const match = /^cc-(by(?:-sa)?)-(\d\.\d)$/.exec(id);
  return match ? `CC ${match[1].toUpperCase()} ${match[2]}` : id;
}

/**
 * The Commons file title in a URL or a bare title.
 * @param text - A file page URL, an `upload.wikimedia.org` URL, a
 *   `Special:FilePath` URL, or `File:…`.
 * @returns `File:…` with spaces, or null when the text names no Commons file.
 */
export function commonsFileTitle(text: string): string | null {
  const value = text.trim();
  if (/^file:/i.test(value)) return normalTitle(value.slice(5));
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const path = url.pathname.split('/').map(safeDecode);
  if (url.hostname === 'upload.wikimedia.org') {
    // /wikipedia/commons/a/ab/Name.jpg or /wikipedia/commons/thumb/a/ab/Name.jpg/330px-Name.jpg
    if (path[1] !== 'wikipedia' || path[2] !== 'commons') return null;
    const name = path[3] === 'thumb' ? path[6] : path[5];
    return name ? normalTitle(name) : null;
  }
  if (!/^(commons\.m\.|commons\.)wikimedia\.org$/.test(url.hostname))
    return null;
  const page =
    path[1] === 'wiki'
      ? path.slice(2).join('/')
      : (url.searchParams.get('title') ?? '');
  const filePath = /^Special:FilePath\/(.+)$/i.exec(page);
  if (filePath) return normalTitle(filePath[1]);
  const file = /^File:(.+)$/i.exec(page);
  return file ? normalTitle(file[1]) : null;
}

/**
 * Address of a Commons file at a given width.
 * @param title - The file title, with or without `File:`.
 * @param width - The width in pixels.
 * @returns A `Special:FilePath` address that redirects to the file.
 */
export function commonsFileUrl(title: string, width: number): string {
  const name = title.replace(/^File:/i, '').replace(/ /g, '_');
  return `${COMMONS_FILE_PATH}${encodeURIComponent(name)}?width=${width}`;
}

/**
 * The licence id for a Commons `License` code.
 * @param code - For example `cc-by-sa-4.0`, `cc0`, or `pd`.
 * @returns An id from `IMAGE_LICENCES`, or null when it is not accepted.
 */
export function commonsLicenceId(code: string | undefined): string | null {
  const value = (code ?? '').trim().toLowerCase();
  const id =
    value === 'pd' ? 'public-domain' : value === 'cc0' ? 'cc0-1.0' : value;
  return (IMAGE_LICENCES as readonly string[]).includes(id) ? id : null;
}

/**
 * Plain text from a Commons HTML value.
 * @param html - The value, such as `Artist` or `ImageDescription`.
 * @returns The text, with whitespace collapsed.
 */
export function plainText(html: string | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A caption from a Commons description: the part before the first line
 * break, at most `CAPTION_MAX` characters, cut at a word.
 * @param html - The `ImageDescription` value.
 * @returns The caption, or an empty string.
 */
export function commonsCaption(html: string | undefined): string {
  const text = plainText((html ?? '').split(/<br\s*\/?>/i)[0]);
  if (text.length <= CAPTION_MAX) return text;
  const cut = text.slice(0, CAPTION_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
}

interface ImageInfoResponse {
  query?: {
    pages?: {
      title: string;
      missing?: boolean;
      imageinfo?: {
        url: string;
        descriptionurl: string;
        width: number;
        height: number;
        mime: string;
        extmetadata?: Record<string, { value?: string } | undefined>;
      }[];
    }[];
  };
}

/**
 * Read a file's creator, licence, size, and description from the Commons API.
 * @param title - The file title, `File:…`.
 * @param signal - Cancels the request.
 * @returns The file, or an error to show.
 */
export async function fetchCommonsFile(
  title: string,
  signal?: AbortSignal
): Promise<CommonsFileResult> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiextmetadatafilter: 'Artist|License|LicenseShortName|ImageDescription',
    titles: title,
  });
  let body: ImageInfoResponse;
  try {
    const response = await fetch(`${COMMONS_API}?${params}`, { signal });
    if (!response.ok) throw new Error(String(response.status));
    body = (await response.json()) as ImageInfoResponse;
  } catch {
    return { status: 'error', message: 'Commons could not be reached.' };
  }
  return readCommonsFile(body);
}

/**
 * Turn a Commons `imageinfo` response into a file.
 * @param body - The parsed response.
 * @returns The file, or an error to show.
 */
export function readCommonsFile(body: ImageInfoResponse): CommonsFileResult {
  const page = body.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info)
    return { status: 'error', message: 'Commons has no file with this name.' };
  if (!IMAGE_TYPES.includes(info.mime))
    return {
      status: 'error',
      message: 'Only JPEG, PNG, and WebP photographs can be used.',
    };
  const meta = info.extmetadata ?? {};
  const licenceId = commonsLicenceId(meta.License?.value);
  if (!licenceId) {
    const name = meta.LicenseShortName?.value ?? 'an unknown licence';
    return {
      status: 'error',
      message: `Commons lists this file under ${plainText(name)}, which is not one of the accepted licences.`,
    };
  }
  const creator = plainText(meta.Artist?.value);
  if (!creator)
    return {
      status: 'error',
      message: 'Commons names no creator for this file.',
    };
  const fileUrl = new URL(info.url);
  fileUrl.search = '';
  return {
    status: 'ok',
    file: {
      title: page.title,
      pageUrl: info.descriptionurl,
      fileUrl: fileUrl.toString(),
      width: info.width,
      height: info.height,
      creator,
      licenceId,
      caption: commonsCaption(meta.ImageDescription?.value),
    },
  };
}

/**
 * A file title from a file name.
 * @param name - The name, encoded or with underscores.
 * @returns `File:…` with spaces.
 */
function normalTitle(name: string): string {
  return `File:${safeDecode(name).replace(/_/g, ' ').trim()}`;
}

/**
 * Decode a URL part, or keep it when it is not valid.
 * @param text - The part.
 * @returns The decoded text.
 */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
