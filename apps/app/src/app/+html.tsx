import { tamaguiConfig } from "../../tamagui.config";
import {
  ScrollViewStyleReset,
  useServerDocumentContext,
} from "expo-router/html";
import type { PropsWithChildren } from "react";
export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } =
    useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="en">
      <head>
        {headNodes}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="description" content="Manage your tasks with Dodo." />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-v1-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-v1-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v1.png" />
        <style dangerouslySetInnerHTML={{ __html: tamaguiConfig.getCSS() }} />
        <ScrollViewStyleReset />
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
