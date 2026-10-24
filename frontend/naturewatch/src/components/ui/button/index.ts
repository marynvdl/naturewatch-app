import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Button } from './Button.vue';

export const buttonVariants = cva(
  'nw nw:appearance-none nw:focus-visible:border-ring nw:focus-visible:ring-ring/50 nw:aria-invalid:ring-destructive/20 nw:dark:aria-invalid:ring-destructive/40 nw:aria-invalid:border-destructive nw:dark:aria-invalid:border-destructive/50 nw:rounded-full nw:border nw:border-transparent nw:bg-clip-padding nw:text-sm nw:font-medium nw:focus-visible:ring-3 nw:aria-invalid:ring-3 nw:[&_svg:not([class*=size-])]:size-4 nw:group/button nw:inline-flex nw:shrink-0 nw:items-center nw:justify-center nw:whitespace-nowrap nw:transition-colors nw:outline-none nw:select-none nw:disabled:pointer-events-none nw:disabled:opacity-50 nw:[&_svg]:pointer-events-none nw:[&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'nw:bg-primary nw:text-primary-foreground nw:hover:bg-primary/80',
        outline:
          'nw:border-border nw:bg-background nw:hover:bg-muted nw:hover:text-foreground nw:dark:bg-input/30 nw:dark:border-input nw:dark:hover:bg-input/50 nw:aria-expanded:bg-muted nw:aria-expanded:text-foreground',
        secondary:
          'nw:bg-secondary nw:text-secondary-foreground nw:hover:bg-secondary/80 nw:aria-expanded:bg-secondary nw:aria-expanded:text-secondary-foreground',
        ghost:
          'nw:hover:bg-muted nw:hover:text-foreground nw:dark:hover:bg-muted/50 nw:aria-expanded:bg-muted nw:aria-expanded:text-foreground',
        destructive:
          'nw:bg-destructive/10 nw:hover:bg-destructive/20 nw:focus-visible:ring-destructive/20 nw:dark:focus-visible:ring-destructive/40 nw:dark:bg-destructive/20 nw:text-destructive nw:focus-visible:border-destructive/40 nw:dark:hover:bg-destructive/30',
        link: 'nw:text-primary nw:underline-offset-4 nw:hover:underline',
      },
      size: {
        default:
          'nw:h-9 nw:gap-1.5 nw:px-4 nw:has-data-[icon=inline-end]:pr-3 nw:has-data-[icon=inline-start]:pl-3',
        xs: 'nw:h-6 nw:gap-1 nw:px-2.5 nw:text-xs nw:has-data-[icon=inline-end]:pr-2 nw:has-data-[icon=inline-start]:pl-2 nw:[&_svg:not([class*=size-])]:size-3',
        sm: 'nw:h-8 nw:gap-1 nw:px-3 nw:has-data-[icon=inline-end]:pr-2.5 nw:has-data-[icon=inline-start]:pl-2.5',
        lg: 'nw:h-10 nw:gap-1.5 nw:px-5 nw:has-data-[icon=inline-end]:pr-4 nw:has-data-[icon=inline-start]:pl-4',
        icon: 'nw:size-9',
        'icon-xs': 'nw:size-6 nw:[&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'nw:size-8',
        'icon-lg': 'nw:size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;
