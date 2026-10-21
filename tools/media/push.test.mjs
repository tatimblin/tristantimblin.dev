import { expect, test } from "bun:test";
import { keyFor } from "./push.mjs";

test("keyFor puts the first 8 hex of the SHA-256 before the extension", () => {
	// sha256("hello") = 2cf24dba...
	expect(keyFor("videos/fabric.mp4", Buffer.from("hello"))).toBe("videos/fabric.2cf24dba.mp4");
	expect(keyFor("top.webm", Buffer.from("hello"))).toBe("top.2cf24dba.webm");
});
