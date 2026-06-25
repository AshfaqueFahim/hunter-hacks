import jsPDF from 'jspdf';

/**
 * Render the AI-generated three-block draft into a letter-format PDF.
 *
 * The on-screen draft uses Unicode "═══" rules as block delimiters, which
 * read as ASCII art in plain text. Here we parse those into proper section
 * headings, restyle bullets and field rows, soften "[ASK TENANT]" and
 * "[YOUR …]" placeholders to underlines (so the printed packet doesn't
 * look like a fill-in-the-blanks worksheet), and lay out the whole thing
 * as a clean Times-set memo a tenant can attach to RA-89.
 */

export type PdfMeta = {
  address: string;
  bbl: string;
  tenantName: string;
  unit: string;
  generatedAt: Date;
};

type Block = { heading: string; lines: string[] };

// Matches the AI drafter's own block delimiters, e.g.
// "═══ A. FIELD VALUES FOR FORM RA-89 ═══" (see complaint-template.ts's
// OUTPUT FORMAT section, which is what guarantees these rules exist).
const BLOCK_RULE = /^═{3,}\s*([A-C])\.\s*(.+?)\s*═{3,}\s*$/;

// Splits the raw AI text into the three named sections (A/B/C). Any text
// before the first rule is dropped (the model isn't supposed to emit a
// preamble, but this guards against it slipping one in anyway).
function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of raw.split('\n')) {
    const m = line.match(BLOCK_RULE);
    if (m) {
      if (current) blocks.push(current);
      current = { heading: `${m[1]}. ${m[2].trim()}`, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

// Replace bracketed placeholders with subtle underlines so the printed
// packet doesn't shout "[YOUR NAME]" at the reader. We keep the textarea
// version as-is — that's where the tenant edits.
function softenPlaceholders(s: string): string {
  return s
    .replace(/\[ASK TENANT\]/g, '________________')
    .replace(/\[YOUR NAME\]/g, '________________')
    .replace(/\[YOUR PHONE\]/g, '________________')
    .replace(/\[YOUR EMAIL\]/g, '________________')
    .replace(/\[YOUR SIGNATURE\]/g, '________________')
    .replace(/\[DATE\]/g, '________________')
    .replace(/\[UNIT #\]/g, '____')
    .replace(/\[OWNER \/ AGENT NAME[^\]]*\]/g, '________________________________')
    .replace(/\[OWNER \/ AGENT MAILING ADDRESS\]/g, '________________________________')
    .replace(/\[OWNER \/ AGENT PHONE\]/g, '________________');
}

// Page geometry in points (jsPDF default for "letter").
const PAGE = { w: 612, h: 792 };
const MARGIN = { top: 64, bottom: 64, left: 64, right: 64 };
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;

const COLORS = {
  ink: [21, 23, 31] as [number, number, number],
  brass: [176, 122, 26] as [number, number, number],
  brassDeep: [135, 90, 13] as [number, number, number],
  rule: [185, 164, 122] as [number, number, number],
  muted: [139, 126, 99] as [number, number, number],
  paperSoft: [239, 229, 210] as [number, number, number],
};

function setColor(doc: jsPDF, c: [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}

function setDraw(doc: jsPDF, c: [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

/**
 * Render the packet to a jsPDF document. Internal helper — public callers
 * use either downloadPdf() (triggers a download) or renderPdfBlobUrl()
 * (returns an object URL suitable for an <iframe src>).
 */
function renderDoc(text: string, meta: PdfMeta): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  // Re-parses the raw text on every render call (including every
  // keystroke when the tenant hand-edits the draft in ComplaintPreview's
  // "Edit the underlying text" box) — cheap enough not to bother caching.
  const blocks = parseBlocks(text);

  let y = MARGIN.top;

  // Body defaults — re-applied after every page break so the footer's
  // italic state never bleeds into the next page's body text.
  const applyBodyStyle = () => {
    doc.setFont('Times', 'normal');
    doc.setFontSize(10.5);
    setColor(doc, COLORS.ink);
  };

  const newPage = () => {
    drawFooter(doc);
    doc.addPage();
    y = MARGIN.top;
    applyBodyStyle();
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE.h - MARGIN.bottom - 36) newPage();
  };

  // ── Header / masthead ────────────────────────────────────────────────
  doc.setFont('Times', 'bold');
  doc.setFontSize(22);
  setColor(doc, COLORS.ink);
  doc.text('Tenant Filing Packet', MARGIN.left, y);
  y += 6;

  doc.setFont('Times', 'italic');
  doc.setFontSize(10);
  setColor(doc, COLORS.brassDeep);
  doc.text('Attachment to DHCR Form RA-89', MARGIN.left, y + 14);
  y += 22;

  // Brass rule
  setDraw(doc, COLORS.brass);
  doc.setLineWidth(1.2);
  doc.line(MARGIN.left, y, PAGE.w - MARGIN.right, y);
  y += 14;

  // Address + meta block
  doc.setFont('Times', 'bold');
  doc.setFontSize(11);
  setColor(doc, COLORS.ink);
  const tenant = meta.tenantName && meta.tenantName !== '[YOUR NAME]' ? meta.tenantName : '____________________';
  const unit = meta.unit && meta.unit !== '[UNIT #]' ? `, Apt ${meta.unit}` : '';
  doc.text(`Re: ${meta.address}${unit}`, MARGIN.left, y);
  y += 14;

  doc.setFont('Times', 'normal');
  doc.setFontSize(10);
  setColor(doc, COLORS.muted);
  doc.text(`Tenant: ${tenant}`, MARGIN.left, y);
  doc.text(`BBL: ${meta.bbl}`, PAGE.w - MARGIN.right, y, { align: 'right' });
  y += 12;
  doc.text(
    `Generated ${meta.generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    MARGIN.left,
    y,
  );
  y += 22;

  // Hairline
  setDraw(doc, COLORS.rule);
  doc.setLineWidth(0.4);
  doc.line(MARGIN.left, y, PAGE.w - MARGIN.right, y);
  y += 22;

  // ── Blocks ──────────────────────────────────────────────────────────
  // One block per page (user request) — gives each section room to breathe
  // and avoids paragraphs splitting awkwardly across page boundaries.
  blocks.forEach((block, blockIdx) => {
    if (blockIdx > 0) {
      // Force a page break before B and C — the masthead block above the
      // first block is meant to read as a "cover" so we don't repeat it.
      drawFooter(doc);
      doc.addPage();
      y = MARGIN.top;
      applyBodyStyle();
    }

    // Section heading: a tiny eyebrow letter ("A.") in brass + serif title
    doc.setFont('Times', 'bold');
    doc.setFontSize(9);
    setColor(doc, COLORS.brassDeep);
    const eyebrow = `SECTION ${block.heading.split('.')[0]}`;
    doc.text(eyebrow, MARGIN.left, y, { charSpace: 1.2 });
    y += 14;

    doc.setFont('Times', 'bold');
    doc.setFontSize(15);
    setColor(doc, COLORS.ink);
    const titleText = block.heading.split('.').slice(1).join('.').trim();
    doc.text(titleText, MARGIN.left, y);
    y += 8;

    // Brass underline under the section title
    setDraw(doc, COLORS.brass);
    doc.setLineWidth(0.8);
    doc.line(MARGIN.left, y, MARGIN.left + 36, y);
    y += 16;

    // Body — every text draw below re-applies its own font/color so the
    // footer's italic state can't leak into a continuation line.
    applyBodyStyle();
    const lineHeight = 14;

    for (const rawLine of block.lines) {
      const softened = softenPlaceholders(rawLine);
      // Skip leading/trailing blank lines that pad blocks
      if (!softened.trim() && y === MARGIN.top) continue;

      if (!softened.trim()) {
        y += lineHeight * 0.5;
        continue;
      }

      // Detect §-prefixed field rows (Section A) — render label bold, value normal.
      // Matches lines like "§9 Current rent: $2,200.00" (see the exact
      // line shapes block A is told to emit in complaint-template.ts).
      const fieldMatch = softened.match(/^(§\d+[a-z]?)\s+(.+?):\s*(.*)$/);
      if (fieldMatch) {
        const [, sectionTag, label, value] = fieldMatch;
        ensureSpace(lineHeight);
        doc.setFont('Times', 'bold');
        doc.setFontSize(10.5);
        setColor(doc, COLORS.brassDeep);
        doc.text(sectionTag, MARGIN.left, y);
        setColor(doc, COLORS.ink);
        const labelW = doc.getTextWidth(`${sectionTag} `);
        doc.text(`${label}:`, MARGIN.left + labelW, y);
        const labelTotal = labelW + doc.getTextWidth(`${label}: `);
        doc.setFont('Times', 'normal');
        setColor(doc, COLORS.ink);
        const wrapped = doc.splitTextToSize(value || '________________', CONTENT_W - labelTotal);
        doc.text(wrapped[0] ?? '', MARGIN.left + labelTotal, y);
        y += lineHeight;
        for (let i = 1; i < wrapped.length; i++) {
          ensureSpace(lineHeight);
          doc.setFont('Times', 'normal');
          doc.setFontSize(10.5);
          setColor(doc, COLORS.ink);
          doc.text(wrapped[i], MARGIN.left + labelTotal, y);
          y += lineHeight;
        }
        continue;
      }

      // Checklist rows — matches "  [ ] do this" / "[X] done" lines from
      // both Section A's §19 evidence boxes and Section C's filing
      // checklist; draws an actual checkbox glyph instead of literal brackets.
      const checklistMatch = softened.match(/^(\s*)\[\s*([Xx ])\s*\]\s*(.*)$/);
      if (checklistMatch) {
        const [, indent, mark, item] = checklistMatch;
        const indentW = (indent?.length ?? 0) * 4;
        const checked = mark.trim().toLowerCase() === 'x';
        ensureSpace(lineHeight);
        setDraw(doc, COLORS.ink);
        doc.setLineWidth(0.5);
        const boxX = MARGIN.left + indentW;
        const boxY = y - 9;
        doc.rect(boxX, boxY, 9, 9, 'S');
        if (checked) {
          setDraw(doc, COLORS.brass);
          doc.setLineWidth(1.4);
          doc.line(boxX + 1.5, boxY + 4.5, boxX + 4, boxY + 7);
          doc.line(boxX + 4, boxY + 7, boxX + 7.5, boxY + 2);
        }
        doc.setFont('Times', checked ? 'bold' : 'normal');
        doc.setFontSize(10.5);
        setColor(doc, COLORS.ink);
        const wrapped = doc.splitTextToSize(item, CONTENT_W - indentW - 16);
        doc.text(wrapped[0] ?? '', boxX + 14, y);
        y += lineHeight;
        for (let i = 1; i < wrapped.length; i++) {
          ensureSpace(lineHeight);
          doc.setFont('Times', checked ? 'bold' : 'normal');
          doc.setFontSize(10.5);
          setColor(doc, COLORS.ink);
          doc.text(wrapped[i], boxX + 14, y);
          y += lineHeight;
        }
        continue;
      }

      // Plain body line — wrap on width. Re-apply font on every line to
      // survive any page break that might happen mid-paragraph.
      const wrapped = doc.splitTextToSize(softened, CONTENT_W);
      for (const w of wrapped) {
        ensureSpace(lineHeight);
        applyBodyStyle();
        doc.text(w, MARGIN.left, y);
        y += lineHeight;
      }
    }
  });

  // ── Final footer ─────────────────────────────────────────────────────
  drawFooter(doc, true);

  // ── Page numbers (after the fact, so we know the total) ─────────────
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('Times', 'italic');
    doc.setFontSize(8);
    setColor(doc, COLORS.muted);
    doc.text(`Page ${i} of ${total}`, PAGE.w - MARGIN.right, PAGE.h - 24, { align: 'right' });
    doc.text(meta.bbl, MARGIN.left, PAGE.h - 24);
  }

  return doc;
}

// Triggers a browser file-save dialog for the "Companion doc" button.
export function downloadPdf(text: string, meta: PdfMeta) {
  const doc = renderDoc(text, meta);
  doc.save(`RA-89-packet-${meta.bbl}.pdf`);
}

/**
 * Render the packet and return an object URL the UI can embed in an
 * <iframe src> to display the PDF inline. Caller is responsible for
 * URL.revokeObjectURL when the URL is no longer needed.
 */
export function renderPdfBlobUrl(text: string, meta: PdfMeta): string {
  const doc = renderDoc(text, meta);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}

// Called on every page (once mid-render per page break, once more at the
// very end for the last page) — `finalPage` swaps the boilerplate footer
// text for the "not legal advice" disclaimer on just the last page.
function drawFooter(doc: jsPDF, finalPage = false) {
  const y = PAGE.h - MARGIN.bottom + 16;
  setDraw(doc, COLORS.rule);
  doc.setLineWidth(0.4);
  doc.line(MARGIN.left, y - 12, PAGE.w - MARGIN.right, y - 12);
  doc.setFont('Times', 'italic');
  doc.setFontSize(8.5);
  setColor(doc, COLORS.muted);
  if (finalPage) {
    doc.text(
      'NOT LEGAL ADVICE — review every line and consider speaking with a tenant attorney before filing.',
      MARGIN.left,
      y,
    );
  } else {
    doc.text('Tenant Filing Packet · attachment to DHCR Form RA-89', MARGIN.left, y);
  }
}
