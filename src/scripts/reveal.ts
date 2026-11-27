// Scroll reveals for everything below the hero (the hero has its own
// entrance, in Hero.astro, on the same timing). Two kinds, chosen in the
// markup:
//
//   data-reveal="lines"  a heading or statement: each word sits in a mask
//                        and the words rise into view a line at a time
//   data-reveal="pieces" a group whose parts have their own entrance
//                        (the About collage): it only gets .is-in, and
//                        --reveal-delay for when its turn comes
//   data-reveal          anything else: fades in, rising 24px
//
// Each line or block takes 900ms on a soft ease-out. Blocks that come into
// view together don't all start at once: they go top to bottom (left to
// right within a row), 70ms apart, with a further 160ms pause before each
// new row, and the lines of one block follow each other 80ms apart. The
// styles are in global.css; the head script in Layout.astro switches them
// on (html.reveal-on) unless reduced motion is set, and shows everything
// anyway if this script never runs.

const DURATION = 900;
const LINE_GAP = 80;
const SLOT = 70;
const ROW_GAP = 160;

// Wraps each word of `el` in a mask. Words inside a textured keyword get
// the texture themselves: a texture clipped to the text doesn't reach
// words that move on their own layer, so it moves with them instead.
function split(el: HTMLElement) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
        const parts = node.data.split(/(\s+)/);
        if (!parts.some((part) => part.trim())) continue;
        const textured = node.parentElement?.closest(".accent-texture");
        const words = document.createDocumentFragment();
        for (const part of parts) {
            if (!part) continue;
            if (!part.trim()) {
                words.append(part);
                continue;
            }
            const mask = document.createElement("span");
            mask.className = "reveal-mask";
            const word = document.createElement("span");
            word.className = "reveal-word";
            if (textured && el.contains(textured)) word.classList.add("accent-texture");
            word.textContent = part;
            mask.append(word);
            words.append(mask);
        }
        node.replaceWith(words);
    }
    el.querySelectorAll(".accent-texture:not(.reveal-word)").forEach((textured) => {
        textured.classList.remove("accent-texture");
    });
    el.classList.add("is-split");
}

// Starts `el`'s reveal after `delay` ms and returns how long it runs.
function play(el: HTMLElement, delay: number) {
    let lines = 1;
    if (el.dataset.reveal === "lines") {
        const tops: number[] = [];
        el.querySelectorAll<HTMLElement>(".reveal-mask").forEach((mask) => {
            const top = mask.getBoundingClientRect().top;
            let line = tops.findIndex((t) => Math.abs(t - top) < 6);
            if (line < 0) line = tops.push(top) - 1;
            mask.style.setProperty("--line", String(line));
        });
        lines = Math.max(1, tops.length);
    }
    el.style.setProperty("--reveal-delay", `${delay}ms`);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
    // Once done, the reveal's styles let go, so the element's own
    // transitions (hovers) work as before.
    setTimeout(() => el.classList.add("is-done"), delay + (lines - 1) * LINE_GAP + DURATION + 100);
}

let clock = 0;
let batch: HTMLElement[] = [];

function flush() {
    const items = batch.splice(0).map((el) => ({ el, box: el.getBoundingClientRect() }));
    items.sort((a, b) =>
        Math.abs(a.box.top - b.box.top) > 24 ? a.box.top - b.box.top : a.box.left - b.box.left,
    );
    const now = performance.now();
    clock = Math.max(clock, now);
    let rowTop: number | null = null;
    for (const { el, box } of items) {
        if (rowTop !== null && Math.abs(box.top - rowTop) > 24) clock += ROW_GAP;
        rowTop = box.top;
        play(el, clock - now);
        clock += SLOT;
    }
}

function queue(el: HTMLElement) {
    if (!batch.length) requestAnimationFrame(flush);
    batch.push(el);
}

export function initReveal() {
    const root = document.documentElement;
    if (!root.classList.contains("reveal-on")) return;
    (window as Window & { __revealReady?: boolean }).__revealReady = true;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    // Lines are measured, so wait for the fonts (0.8s at most).
    Promise.race([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 800)),
    ]).then(() => {
        els.forEach((el) => el.dataset.reveal === "lines" && split(el));
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const el = entry.target as HTMLElement;
                    if (entry.isIntersecting) {
                        observer.unobserve(el);
                        queue(el);
                    } else if (entry.boundingClientRect.bottom < 0) {
                        // Already scrolled past (a reload part way down the
                        // page, a jump to a section): just show it.
                        observer.unobserve(el);
                        el.classList.add("is-in", "is-done");
                    }
                }
            },
            { rootMargin: "0px 0px -6% 0px" },
        );
        els.forEach((el) => observer.observe(el));
    });
}
