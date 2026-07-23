/** Join class names, dropping falsy entries. The DS-port class-binding helper. */
export function cx(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}
