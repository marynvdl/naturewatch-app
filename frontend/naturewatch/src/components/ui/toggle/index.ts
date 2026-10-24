import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Toggle } from './Toggle.vue';

export const toggleVariants = cva(
  'nw nw:appearance-none nw:hover:text-foreground nw:aria-pressed:bg-on nw:aria-pressed:text-on-foreground nw:focus-visible:border-ring nw:focus-visible:ring-ring/50 nw:aria-invalid:ring-destructive/20 nw:dark:aria-invalid:ring-destructive/40 nw:aria-invalid:border-destructive nw:gap-1 nw:rounded-full nw:text-sm nw:font-medium nw:transition-colors nw:[&_svg:not([class*=size-])]:size-4 nw:group/toggle nw:hover:bg-muted nw:inline-flex nw:items-center nw:justify-center nw:whitespace-nowrap nw:outline-none nw:focus-visible:ring-3 nw:disabled:pointer-events-none nw:disabled:opacity-50 nw:[&_svg]:pointer-events-none nw:[&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'nw:bg-transparent',
        outline:
          'nw:border-input nw:hover:bg-muted nw:border nw:bg-transparent',
      },
      size: {
        default:
          'nw:h-9 nw:min-w-9 nw:px-2.5 nw:has-data-[icon=inline-end]:pr-2 nw:has-data-[icon=inline-start]:pl-2',
        sm: 'nw:h-8 nw:min-w-8 nw:px-2.5 nw:has-data-[icon=inline-end]:pr-1.5 nw:has-data-[icon=inline-start]:pl-1.5',
        lg: 'nw:h-10 nw:min-w-10 nw:px-2.5 nw:has-data-[icon=inline-end]:pr-2 nw:has-data-[icon=inline-start]:pl-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ToggleVariants = VariantProps<typeof toggleVariants>;
