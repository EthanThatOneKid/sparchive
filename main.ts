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
  bindings.addEventListener("Network.responseReceived", async (event) => {
    const id = (Math.floor(Math.random() * 100)).toString().padStart(4, "0");
    await Deno.writeTextFile(
      `${id}_response.json`,
      JSON.stringify(event.detail, null, 2),
    );
  });
  await page.goto(url.toString(), { waitUntil: "networkidle0" });
}
