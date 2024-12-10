import { decodeBase64 } from "@std/encoding";
import { exists } from "@std/fs";
import { dirname } from "@std/path/dirname";
import type { Page } from "@astral/astral";
import { launch } from "@astral/astral";

// https://jsr.io/@std/cli/doc/~/parseArgs

const outputDirectory = "build";
const entrypointURL = new URL("http://localhost:5126/");

if (import.meta.main) {
  const browser = await launch();
  const page = await browser.newPage();

  if (await exists(outputDirectory)) {
    await Deno.remove(outputDirectory, { recursive: true });
  }

  await download(page, entrypointURL);
  await browser.close();
}

async function download(
  page: Page,
  url: URL,
  visited = new Set<string>(),
) {
  console.info(`### Downloading: ${url} to ${"?"}`);

  const bindings = page.unsafelyGetCelestialBindings();
  await bindings.Network.enable({});

  const requests = new Map<string, string>();
  bindings.addEventListener("Network.responseReceived", (event) => {
    if (!URL.canParse(event.detail.response.url)) {
      return;
    }

    const eventURL = new URL(event.detail.response.url);
    if (eventURL.origin !== url.origin) {
      return;
    }

    const filename = `${outputDirectory}${
      event.detail.response.mimeType === "text/html"
        ? resolveIndex(eventURL.pathname)
        : eventURL.pathname
    }`;
    if (visited.has(filename)) {
      return;
    }

    console.info(`Identified: ${eventURL} as ${filename}`);
    visited.add(filename);
    requests.set(filename, event.detail.requestId);
  });

  await page.goto(url.toString(), { waitUntil: "load" });

  // Download all the assets.
  for (const [filename, id] of requests) {
    const response = await bindings.Network.getResponseBody({ requestId: id });
    await Deno.mkdir(dirname(filename), { recursive: true });

    const file = await Deno.open(filename, { create: true, write: true });
    const data = response.base64Encoded
      ? decodeBase64(response.body)
      : new TextEncoder().encode(response.body);
    await file.write(data);
    file.close();
  }

  // Find all the links in the HTML and download them recursively.
  const hrefs: string[] = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a")).map((a) => a.href);
  });

  // Download all the links that have not been visited yet.
  for (const href of hrefs) {
    if (!URL.canParse(href)) {
      console.warn(`Invalid URL: ${href}`);
      continue;
    }

    const hrefURL = new URL(href);
    if (hrefURL.origin !== url.origin) {
      continue;
    }

    const filename = `${outputDirectory}${resolveIndex(hrefURL.pathname)}`;
    if (visited.has(filename)) {
      continue;
    }

    await download(page, hrefURL, visited);
  }
}

function resolveIndex(pathname: string): string {
  return `${pathname}${pathname.endsWith("/") ? "" : "/"}index.html`;
}
