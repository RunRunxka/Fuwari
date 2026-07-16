const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const RUNTIME_SPRITE_ID = "runtime-svg-symbol-sprite";

const symbolRegistry = new Map<string, SVGSymbolElement>();

function rememberSvgSymbols(root: ParentNode): void {
	for (const symbol of root.querySelectorAll<SVGSymbolElement>("symbol[id]")) {
		if (!symbolRegistry.has(symbol.id)) {
			symbolRegistry.set(symbol.id, symbol.cloneNode(true) as SVGSymbolElement);
		}
	}
}

function getRuntimeSprite(): SVGSVGElement {
	const existing = document.getElementById(RUNTIME_SPRITE_ID);
	if (existing?.tagName.toLowerCase() === "svg") {
		return existing as unknown as SVGSVGElement;
	}

	const sprite = document.createElementNS(SVG_NAMESPACE, "svg");
	sprite.id = RUNTIME_SPRITE_ID;
	sprite.setAttribute("aria-hidden", "true");
	sprite.setAttribute("width", "0");
	sprite.setAttribute("height", "0");
	sprite.style.position = "absolute";
	sprite.style.overflow = "hidden";
	sprite.style.pointerEvents = "none";

	const host =
		document.getElementById("global-svg-symbol-source") ?? document.body;
	host.appendChild(sprite);
	return sprite;
}

function getUseHref(use: SVGUseElement): string | null {
	return (
		use.getAttribute("href") ??
		use.getAttributeNS(XLINK_NAMESPACE, "href") ??
		use.getAttribute("xlink:href")
	);
}

function getLocalSymbolId(href: string | null): string | null {
	if (!href?.startsWith("#") || href.length === 1) return null;
	return href.slice(1);
}

function refreshUseHref(use: SVGUseElement, href: string): void {
	if (use.hasAttribute("href")) {
		use.removeAttribute("href");
		use.setAttribute("href", href);
		return;
	}

	use.removeAttributeNS(XLINK_NAMESPACE, "href");
	use.removeAttribute("xlink:href");
	use.setAttributeNS(XLINK_NAMESPACE, "xlink:href", href);
}

export interface SvgSymbolRepairResult {
	checked: number;
	restored: string[];
	unresolved: string[];
}

export function repairSvgSymbols(
	root: ParentNode = document,
): SvgSymbolRepairResult {
	rememberSvgSymbols(document);

	const restored = new Set<string>();
	const unresolved = new Set<string>();
	const uses = root.querySelectorAll<SVGUseElement>("svg use");

	for (const use of uses) {
		const href = getUseHref(use);
		const symbolId = getLocalSymbolId(href);
		if (!href || !symbolId) continue;

		if (!document.getElementById(symbolId)) {
			const registeredSymbol = symbolRegistry.get(symbolId);
			if (registeredSymbol) {
				getRuntimeSprite().appendChild(registeredSymbol.cloneNode(true));
				restored.add(symbolId);
			} else {
				unresolved.add(symbolId);
			}
		}

		if (document.getElementById(symbolId)) {
			refreshUseHref(use, href);
		}
	}

	if (unresolved.size > 0) {
		console.warn(
			"Unable to restore missing SVG symbols:",
			Array.from(unresolved),
		);
	}

	return {
		checked: uses.length,
		restored: Array.from(restored),
		unresolved: Array.from(unresolved),
	};
}

export function scheduleSvgSymbolRepair(onComplete?: () => void): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			repairSvgSymbols();
			onComplete?.();
		});
	});
}
