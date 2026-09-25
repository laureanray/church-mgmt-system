import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { composeStories } from "@storybook/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as stories from "@/components/members/member-qr.stories";

const { Default, MarkupInName } = composeStories(stories);

/** Stand in for the popup: a blank document of its own, like `about:blank`. */
function stubPopup() {
  const popup = {
    document: document.implementation.createHTMLDocument(""),
    print: mock(),
  };
  const open = spyOn(window, "open").mockReturnValue(
    popup as unknown as Window,
  );
  return { popup, open };
}

afterEach(() => {
  mock.restore();
});

describe("MemberQr", () => {
  test("shows the code, its token and both actions", () => {
    render(<Default />);

    expect(screen.getByRole("img", { name: "QR code for Ana Reyes" })).toBeInTheDocument();
    expect(screen.getByText("V1StGXR8_Z5jdHi6B-myT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      "Ana-Reyes-qr.png",
    );
  });

  test("prints the name, code and token, once", async () => {
    const user = userEvent.setup();
    const { popup } = stubPopup();
    render(<Default />);

    await user.click(screen.getByRole("button", { name: "Print" }));

    const doc = popup.document;
    expect(doc.title).toBe("Ana Reyes — QR");
    expect(doc.querySelector("h1")?.textContent).toBe("Ana Reyes");
    expect(doc.querySelector("code")?.textContent).toBe("V1StGXR8_Z5jdHi6B-myT");

    // Printing waits for the image. happy-dom may already have fired its load,
    // so fire it again: the listener is once-only, so this cannot double-print.
    doc.querySelector("img")?.dispatchEvent(new Event("load"));
    expect(popup.print).toHaveBeenCalledTimes(1);
  });

  test("a name containing markup prints as text, never as HTML", async () => {
    const user = userEvent.setup();
    const { popup } = stubPopup();
    render(<MarkupInName />);

    await user.click(screen.getByRole("button", { name: "Print" }));

    const doc = popup.document;
    const name = '<img src=x onerror="alert(1)"> Reyes';
    expect(doc.querySelector("h1")?.textContent).toBe(name);
    expect(doc.title).toBe(`${name} — QR`);
    // Only the QR image itself: the name did not become an element.
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(doc.querySelector("[onerror]")).toBeNull();
    expect(doc.querySelector("script")).toBeNull();
  });
});
