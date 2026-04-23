import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

/**
 * Render a Link that opens an external URL, using an in-app browser on native platforms.
 *
 * The component enforces `target="_blank"`. On native platforms it intercepts the press
 * event and opens `href` in an in-app browser; on web it preserves the default link behavior.
 *
 * @param href - The destination URL to open when the link is activated
 * @returns A Link element that navigates to `href`; on native platforms the link opens in an in-app browser, on web it opens normally
 */
export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          event.preventDefault();
          // Open the link in an in-app browser.
          await openBrowserAsync(href, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          });
        }
      }}
    />
  );
}
