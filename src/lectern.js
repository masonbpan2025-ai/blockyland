// Lecterns with a book (Java Edition).
//
// Wiki (Lectern): a book and quill or written book is placed on it; "Lecterns holding a book emit a full-strength
// redstone pulse that is 2 game ticks long when a page is turned"; a comparator reads the open page:
// "S = floor(1 + 14(P - 1) / (M - 1))" for a book of M pages open at page P, and "A book with only 1 page gives maximum
// signal strength". Tutorial:Sculk redstone: "fill it with 15 non-empty pages ... page #7 makes it output power level
// 7". The lectern held nothing before. Pages turn with a click here (the reading screen's arrow); sneaking with an
// empty hand takes the book back (its "Take Book" button).
import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';

if (BLOCK_DEFS[B.LECTERN]) Object.assign(BLOCK_DEFS[B.LECTERN], { redstone: true, redstoneNativeModel: true });
const BOOKS = new Set(['writable_book', 'written_book']);
const pagesOf = (item) => Math.max(1, item?.itemData?.pages?.length ?? item?.pages?.length ?? 1);

/** Comparator signal from a lectern's state. */
export function lecternSignal(s) {
  const book = s?.book; if (!book) return 0;
  if (book.pages <= 1) return 15;
  return Math.floor(1 + (14 * (book.page - 1)) / (book.pages - 1));
}

/** Use (right-click) a lectern; returns the message the game shows. */
export function useLectern(engine, s, sneak, held) {
  const game = engine.game;
  if (!s.book) {
    if (!held || !BOOKS.has(held.id)) return null;
    s.book = { pages: pagesOf(held), page: 1, item: { ...held, count: 1 } };
    held.count -= 1;
    engine.mark(s.p);
    return 'Book placed on the lectern';
  }
  if (sneak && !held) {
    game?.inventory?.addItem?.(s.book.item.id, false, 1);
    const back = game?.inventory?.hotbar?.find((it) => it?.id === s.book.item.id && !it.itemData);
    if (back && s.book.item.itemData) back.itemData = s.book.item.itemData;
    delete s.book; engine.mark(s.p);
    return 'Took the book';
  }
  s.book.page = s.book.page % s.book.pages + 1;
  s.until = engine.tickNumber + 1; // a 2-game-tick pulse
  s.output = 15; engine.mark(s.p);
  return `Page ${s.book.page} of ${s.book.pages}`;
}
