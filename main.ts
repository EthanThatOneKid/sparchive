import { parseArgs } from "@std/cli/parse-args";
import { decodeBase64 } from "@std/encoding";
import { exists } from "@std/fs";
import { dirname } from "@std/path/dirname";
import type { Page } from "@astral/astral";
import { launch } from "@astral/astral";

if (import.meta.main) {
  const parsedArgs = parseArgs(Deno.args, {
    string: ["output", "entrypoint"],
    default: { output: "build" },
  });

  const browser = await launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage();

  if (await exists(parsedArgs.output)) {
    await Deno.remove(parsedArgs.output, { recursive: true });
  }

  if (parsedArgs.entrypoint === undefined) {
    throw new Error("Missing entrypoint");
  }

  await download(page, new URL(parsedArgs.entrypoint), parsedArgs.output);
  await browser.close();
}

async function download(
  page: Page,
  url: URL,
  output: string,
  visited = new Set<string>(),
) {
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

    const filename = `${output}${
      event.detail.response.mimeType === "text/html"
        ? resolveIndex(eventURL.pathname)
        : eventURL.pathname
    }`;
    if (visited.has(filename)) {
      return;
    }

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
    visited.add(filename);
  }

  // Find all the links in the HTML and download them recursively.
  const hrefs: string[] = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("[href]"),
      (element) => element.getAttribute("href"),
    ).filter((href) => href !== null);
  });

  // Download all the links that have not been visited yet.
  for (const href of hrefs) {
    if (!URL.canParse(href)) {
      continue;
    }

    const hrefURL = new URL(href);
    if (hrefURL.origin !== url.origin) {
      continue;
    }

    const filename = `${output}${resolveIndex(hrefURL.pathname)}`;
    if (visited.has(filename)) {
      continue;
    }

    // TODO: Handle case where the filename is the same as the current page.
    await download(page, hrefURL, output, visited);
  }
}

function resolveIndex(pathname: string): string {
  return `${pathname}${pathname.endsWith("/") ? "" : "/"}index.html`;
}
