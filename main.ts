import { Page } from "jsr:@astral/astral";
import { launch } from "jsr:@astral/astral";

// https://jsr.io/@std/cli/doc/~/parseArgs

if (import.meta.main) {
  const browser = await launch();
  const page = await browser.newPage();
  await download(page, new URL("http://localhost:5126/"));
  await browser.close();
}

async function download(
  page: Page,
  url: URL,
) {
  const bindings = page.unsafelyGetCelestialBindings();
  await bindings.Network.enable({});

  // TODO: Store media type and content encoding.
  const requests = new Map<string, string>();
  bindings.addEventListener("Network.responseReceived", async (event) => {
    if (!event.detail.response.protocol!.startsWith("http")) {
      return;
    }

    const eventURL = new URL(event.detail.response.url);
    if (eventURL.origin !== url.origin) {
      return;
    }

    requests.set(eventURL.pathname, event.detail.requestId);
  });

  await page.goto(
    url.toString(),
    { waitUntil: "load" },
  );

  for (const [pathname, _id] of requests) {
    // const response = await bindings.Network.getResponseBody({ requestId: id });
    console.log(pathname);
  }
}
