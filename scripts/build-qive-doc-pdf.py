"""
Converte .qive-doc.md em PDF usando reportlab.
Layout: A4, margens 2cm, header/footer, índice, tabelas com bordas,
código mono. Salva em docs/qive-integration.pdf.
"""
import os
import re
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
    Table,
    TableStyle,
    Preformatted,
    KeepTogether,
)
from reportlab.pdfgen import canvas

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
SRC = os.path.join(_ROOT, "docs", "qive-integration.md")
DST_DIR = os.path.join(_ROOT, "docs")
DST = os.path.join(DST_DIR, "qive-integration.pdf")

os.makedirs(DST_DIR, exist_ok=True)

with open(SRC, "r", encoding="utf-8") as f:
    md = f.read()


# ────── Estilos
styles = getSampleStyleSheet()
H1 = ParagraphStyle(
    "H1",
    parent=styles["Heading1"],
    fontSize=18,
    leading=22,
    spaceBefore=18,
    spaceAfter=10,
    textColor=colors.HexColor("#1F4E79"),
)
H2 = ParagraphStyle(
    "H2",
    parent=styles["Heading2"],
    fontSize=14,
    leading=18,
    spaceBefore=14,
    spaceAfter=6,
    textColor=colors.HexColor("#1F4E79"),
)
H3 = ParagraphStyle(
    "H3",
    parent=styles["Heading3"],
    fontSize=11,
    leading=14,
    spaceBefore=10,
    spaceAfter=4,
    textColor=colors.HexColor("#2E75B6"),
)
H4 = ParagraphStyle(
    "H4",
    parent=styles["Heading4"],
    fontSize=10,
    leading=13,
    spaceBefore=8,
    spaceAfter=3,
    textColor=colors.HexColor("#555555"),
    fontName="Helvetica-Bold",
)
BODY = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontSize=9.5,
    leading=13,
    spaceAfter=6,
    alignment=TA_LEFT,
)
LIST = ParagraphStyle(
    "List",
    parent=BODY,
    leftIndent=12,
    bulletIndent=0,
    spaceAfter=3,
)
CODE_INLINE_STYLE = '<font face="Courier" size="9" color="#9d174d">{}</font>'
CODE_BLOCK = ParagraphStyle(
    "Code",
    fontName="Courier",
    fontSize=8.5,
    leading=11,
    leftIndent=8,
    rightIndent=8,
    backColor=colors.HexColor("#f3f4f6"),
    borderColor=colors.HexColor("#d1d5db"),
    borderWidth=0.5,
    borderPadding=4,
    spaceAfter=8,
)


# ────── Conversão linha-a-linha
def inline(text: str) -> str:
    """Converte markdown inline (bold, italic, code, links) em mini-HTML do reportlab."""
    # escape HTML
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # code inline: `xxx` -> mono color
    text = re.sub(r"`([^`]+)`", lambda m: CODE_INLINE_STYLE.format(m.group(1)), text)
    # bold: **xxx**
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    # italic: *xxx* (cuidado pra não pegar listas — assume após espaço/início)
    text = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", text)
    # links: [txt](url) — limpa aspas literais que aparecem no URL vindo
    # de descrições do Swagger (`("http://...")`).
    def _link_sub(m):
        url = m.group(2).strip().strip('"').strip("'")
        # se a URL tem caracteres que vão quebrar o paraparser, codifica.
        url = url.replace('"', "%22")
        return f'<link href="{url}" color="#1F4E79"><u>{m.group(1)}</u></link>'

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", _link_sub, text)
    return text


story = []
lines = md.split("\n")
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    # H1
    if stripped.startswith("# "):
        story.append(Paragraph(inline(stripped[2:]), H1))
    elif stripped.startswith("## "):
        story.append(Paragraph(inline(stripped[3:]), H2))
    elif stripped.startswith("### "):
        story.append(Paragraph(inline(stripped[4:]), H3))
    elif stripped.startswith("#### "):
        story.append(Paragraph(inline(stripped[5:]), H4))
    # HR
    elif stripped == "---":
        story.append(Spacer(1, 4))
    # Code block (```)
    elif stripped.startswith("```"):
        i += 1
        block = []
        while i < len(lines) and not lines[i].strip().startswith("```"):
            block.append(lines[i])
            i += 1
        story.append(Preformatted("\n".join(block), CODE_BLOCK))
    # Tabela markdown (linha com | e próxima com ---)
    elif "|" in stripped and i + 1 < len(lines) and re.match(r"^\s*\|[\s\-:|]+\|\s*$", lines[i + 1]):
        # Cabeçalho
        header = [c.strip() for c in stripped.strip("|").split("|")]
        i += 2
        rows = [header]
        while i < len(lines) and "|" in lines[i] and lines[i].strip().startswith("|"):
            cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows.append(cells)
            i += 1
        i -= 1
        # Converte inline markdown nas células
        rendered = [[Paragraph(inline(c), BODY) for c in row] for row in rows]
        t = Table(rendered, repeatRows=1, colWidths=None)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E79")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(t)
        story.append(Spacer(1, 6))
    # Lista
    elif stripped.startswith("- ") or stripped.startswith("* "):
        bullet = "•"
        story.append(Paragraph(f"{bullet} {inline(stripped[2:])}", LIST))
    # Blockquote
    elif stripped.startswith("> "):
        bq = ParagraphStyle(
            "BQ",
            parent=BODY,
            leftIndent=12,
            textColor=colors.HexColor("#444444"),
            borderColor=colors.HexColor("#999999"),
            borderPadding=(0, 0, 0, 6),
        )
        story.append(Paragraph(inline(stripped[2:]), bq))
    # Parágrafo normal
    elif stripped:
        story.append(Paragraph(inline(stripped), BODY))
    else:
        story.append(Spacer(1, 4))
    i += 1


# ────── Header + footer
def header_footer(canvas_obj: canvas.Canvas, doc):
    canvas_obj.saveState()
    # header
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(colors.HexColor("#555555"))
    canvas_obj.drawString(2 * cm, A4[1] - 1.2 * cm, "Qive API — Documentação técnica")
    canvas_obj.drawRightString(
        A4[0] - 2 * cm, A4[1] - 1.2 * cm, "P2P — HRG3 / Guess"
    )
    canvas_obj.setStrokeColor(colors.HexColor("#cccccc"))
    canvas_obj.line(2 * cm, A4[1] - 1.4 * cm, A4[0] - 2 * cm, A4[1] - 1.4 * cm)
    # footer
    canvas_obj.drawCentredString(A4[0] / 2, 1.2 * cm, f"página {doc.page}")
    canvas_obj.restoreState()


doc = SimpleDocTemplate(
    DST,
    pagesize=A4,
    topMargin=2 * cm,
    bottomMargin=2 * cm,
    leftMargin=2 * cm,
    rightMargin=2 * cm,
    title="Qive API — Documentação técnica",
    author="P2P — HRG3 / Guess",
)
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(f"OK: {DST}")
print(f"   tamanho: {os.path.getsize(DST) / 1024:.1f} KB")
