import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/commons-imageinfo.json';
import {
  CAPTION_MAX,
  commonsCaption,
  commonsFileTitle,
  commonsFileUrl,
  commonsLicenceId,
  fetchCommonsFile,
  licenceShortName,
  readCommonsFile,
} from '@/places/commons';

const TITLE = 'File:Kruger National Park (ZA), Giraffe -- 2024 -- 0431.jpg';

/** The fixture with its extmetadata and mime changed. */
function withInfo(change: Record<string, unknown>) {
  const body = structuredClone(fixture);
  Object.assign(body.query.pages[0].imageinfo[0], change);
  return body;
}

describe('Commons file titles', () => {
  it.each([
    'https://commons.wikimedia.org/wiki/File:Kruger_National_Park_(ZA),_Giraffe_--_2024_--_0431.jpg',
    'https://commons.m.wikimedia.org/wiki/File:Kruger_National_Park_(ZA),_Giraffe_--_2024_--_0431.jpg?uselang=en',
    'https://commons.wikimedia.org/w/index.php?title=File:Kruger_National_Park_(ZA),_Giraffe_--_2024_--_0431.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/a/a8/Kruger_National_Park_%28ZA%29%2C_Giraffe_--_2024_--_0431.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Kruger_National_Park_%28ZA%29%2C_Giraffe_--_2024_--_0431.jpg/330px-Kruger_National_Park_%28ZA%29%2C_Giraffe_--_2024_--_0431.jpg',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Kruger_National_Park_(ZA),_Giraffe_--_2024_--_0431.jpg?width=330',
    'File:Kruger National Park (ZA), Giraffe -- 2024 -- 0431.jpg',
  ])('reads %s', url => {
    expect(commonsFileTitle(url)).toBe(TITLE);
  });

  it.each([
    'https://example.org/File:Kruger.jpg',
    'https://commons.wikimedia.org/wiki/Category:Kruger_National_Park',
    'https://upload.wikimedia.org/wikipedia/en/a/a8/Local.jpg',
    'not a url',
  ])('refuses %s', url => {
    expect(commonsFileTitle(url)).toBeNull();
  });

  it('builds a file address at a width', () => {
    expect(commonsFileUrl(TITLE, 330)).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/Kruger_National_Park_(ZA)%2C_Giraffe_--_2024_--_0431.jpg?width=330'
    );
  });
});

describe('Commons licences', () => {
  it('maps the accepted codes and refuses the rest', () => {
    expect(commonsLicenceId('cc-by-sa-4.0')).toBe('cc-by-sa-4.0');
    expect(commonsLicenceId('pd')).toBe('public-domain');
    expect(commonsLicenceId('cc0')).toBe('cc0-1.0');
    expect(commonsLicenceId('cc-by-sa-3.0-de')).toBeNull();
    expect(commonsLicenceId('cc-by-nc-4.0')).toBeNull();
    expect(commonsLicenceId(undefined)).toBeNull();
  });

  it('gives short names for credits', () => {
    expect(licenceShortName('cc-by-sa-4.0')).toBe('CC BY-SA 4.0');
    expect(licenceShortName('cc-by-2.0')).toBe('CC BY 2.0');
    expect(licenceShortName('cc0-1.0')).toBe('CC0');
    expect(licenceShortName('public-domain')).toBe('Public domain');
  });
});

describe('Commons file details', () => {
  it('reads the creator, licence, size, and caption', () => {
    const result = readCommonsFile(fixture);
    expect(result).toEqual({
      status: 'ok',
      file: {
        title: TITLE,
        pageUrl:
          'https://commons.wikimedia.org/wiki/File:Kruger_National_Park_(ZA),_Giraffe_--_2024_--_0431.jpg',
        fileUrl:
          'https://upload.wikimedia.org/wikipedia/commons/a/a8/Kruger_National_Park_%28ZA%29%2C_Giraffe_--_2024_--_0431.jpg',
        width: 4480,
        height: 5973,
        creator: 'Dietmar Rabich',
        licenceId: 'cc-by-sa-4.0',
        caption:
          'Giraffe (near the Pretoriuskop–Skukuza Road/Napi Road south of Skukuza), Kruger National Park, Mpumalanga, South Africa',
      },
    });
  });

  it('refuses a licence that is not accepted', () => {
    const body = withInfo({
      extmetadata: {
        ...fixture.query.pages[0].imageinfo[0].extmetadata,
        License: { value: 'cc-by-sa-3.0-de' },
        LicenseShortName: { value: 'CC BY-SA 3.0 de' },
      },
    });
    expect(readCommonsFile(body)).toEqual({
      status: 'error',
      message:
        'Commons lists this file under CC BY-SA 3.0 de, which is not one of the accepted licences.',
    });
  });

  it('refuses a file a browser cannot show, and a missing file', () => {
    expect(readCommonsFile(withInfo({ mime: 'image/tiff' })).status).toBe(
      'error'
    );
    expect(
      readCommonsFile({ query: { pages: [{ title: TITLE, missing: true }] } })
    ).toEqual({
      status: 'error',
      message: 'Commons has no file with this name.',
    });
  });

  it('cuts a long caption at a word', () => {
    const caption = commonsCaption(`<b>${'word '.repeat(100)}</b>`);
    expect(caption.length).toBeLessThanOrEqual(CAPTION_MAX);
    expect(caption.endsWith('word…')).toBe(true);
  });

  describe('from the API', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('asks Commons for the file with origin=*', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = await fetchCommonsFile(TITLE);
      expect(result.status).toBe('ok');
      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(url.searchParams.get('origin')).toBe('*');
      expect(url.searchParams.get('titles')).toBe(TITLE);
    });

    it('says when Commons cannot be reached', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      expect(await fetchCommonsFile(TITLE)).toEqual({
        status: 'error',
        message: 'Commons could not be reached.',
      });
    });
  });
});
