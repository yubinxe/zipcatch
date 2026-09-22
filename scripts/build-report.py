# -*- coding: utf-8 -*-
"""
사업보고용 PDF 한 권으로 묶는다.

캡처한 화면은 폭 1440px 짜리 긴 낱장이라 크기가 제각각이다.
표지·간지를 그 폭에 맞춰 만들어야 한 권 안에서 페이지가 들쭉날쭉하지 않다.

서체는 프로젝트가 쓰는 것을 그대로 쓴다 — 보고서와 화면이 다른 얼굴이면
같은 제품으로 안 읽힌다.
"""
import io, json, os
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

BASE = os.getcwd()
PAGES = os.path.join(BASE, 'docs', '보고', 'pages')
OUT = os.path.join(BASE, 'docs', '보고', '집캐치_사업보고.pdf')

meta = json.load(io.open(os.path.join(PAGES, 'pages.json'), encoding='utf-8'))

FONTS = os.path.join(BASE, 'app', 'fonts')
pdfmetrics.registerFont(TTFont('Brand', os.path.join(FONTS, 'GmarketSansTTFBold.ttf')))
pdfmetrics.registerFont(TTFont('BrandM', os.path.join(FONTS, 'GmarketSansTTFMedium.ttf')))
# Pretendard 는 OTF(포스트스크립트 윤곽)라 reportlab 이 읽지 못한다.
# 본문은 시스템의 맑은 고딕(TTF)을 쓴다 — 제목만 브랜드 서체면 얼굴은 유지된다.
WIN = os.environ.get('WINDIR', r'C:\Windows') + r'\Fonts'
pdfmetrics.registerFont(TTFont('Body', os.path.join(WIN, 'malgun.ttf')))
pdfmetrics.registerFont(TTFont('BodyB', os.path.join(WIN, 'malgunbd.ttf')))

W = 1440.0
H = 1000.0

# 지면 색 — 화면과 같은 팔레트
PAPER = (0xF4 / 255, 0xF1 / 255, 0xEB / 255)
INK = (0x14 / 255, 0x11 / 255, 0x0C / 255)
BODY = (0x3B / 255, 0x35 / 255, 0x2C / 255)
MUTED = (0x6F / 255, 0x68 / 255, 0x59 / 255)
ACCENT = (0xA8 / 255, 0x3A / 255, 0x20 / 255)
LINE = (0xE2 / 255, 0xDB / 255, 0xCF / 255)


def page_bytes(draw, w=W, h=H):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFillColorRGB(*PAPER)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    draw(c, w, h)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def cover(c, w, h):
    L = 110
    # 위쪽 굵은 괘선
    c.setFillColorRGB(*INK)
    c.rect(L, h - 92, w - L * 2, 3, fill=1, stroke=0)

    c.setFont('BrandM', 19)
    c.setFillColorRGB(*MUTED)
    c.drawString(L, h - 140, '사업 보고')

    c.setFont('Brand', 86)
    c.setFillColorRGB(*INK)
    c.drawString(L, h - 268, '집캐치')

    c.setFont('BrandM', 34)
    c.setFillColorRGB(*BODY)
    c.drawString(L, h - 336, '나에게 맞는 집, 내집마련 기회를 사로잡아 보세요')

    # 한 줄 정의
    c.setFillColorRGB(*ACCENT)
    c.rect(L, h - 430, 74, 3, fill=1, stroke=0)
    c.setFont('Body', 22)
    c.setFillColorRGB(*BODY)
    for i, line in enumerate([
        '청약·공공임대 공고를 찾아 확인하는 일을 사람이 매일 반복하지 않게 만든 CRM 입니다.',
        '소비자에게는 조건에 맞는 공고를 골라주고, 사업자에게는 그 반응을 고객 단위로 쌓아',
        '누구에게 먼저 연락할지 알려줍니다. 두 화면은 같은 데이터를 씁니다.',
    ]):
        c.drawString(L, h - 476 - i * 36, line)

    # 수치 — 보고서는 숫자로 시작해야 한다
    facts = [
        ('실제 공고', '169건', '청약홈 47 · LH 122'),
        ('지자체 상징', '34개', '광역 17 · 시군구 17'),
        ('자동 루틴', '3개', '매일 예약 실행'),
        ('데이터원', '4곳', '청약홈 · LH · 국토부 · 카카오'),
    ]
    x = L
    for k, v, sub in facts:
        c.setFont('Body', 17)
        c.setFillColorRGB(*MUTED)
        c.drawString(x, h - 660, k)
        c.setFont('Brand', 44)
        c.setFillColorRGB(*INK)
        c.drawString(x, h - 716, v)
        c.setFont('Body', 15)
        c.setFillColorRGB(*MUTED)
        c.drawString(x, h - 744, sub)
        x += 310

    # 바닥
    c.setFillColorRGB(*LINE)
    c.rect(L, 132, w - L * 2, 1, fill=1, stroke=0)
    c.setFont('Body', 17)
    c.setFillColorRGB(*MUTED)
    c.drawString(L, 100, meta['origin'])
    stamp = meta['capturedAt'][:10].replace('-', '. ')
    c.drawRightString(w - L, 100, f'{stamp} 기준 화면')


def toc(c, w, h):
    L = 110
    c.setFillColorRGB(*INK)
    c.rect(L, h - 92, w - L * 2, 3, fill=1, stroke=0)
    c.setFont('Brand', 42)
    c.drawString(L, h - 162, '담긴 화면')

    c.setFont('Body', 19)
    c.setFillColorRGB(*MUTED)
    c.drawString(L, h - 204, '실제 서비스 화면을 그대로 떴습니다. 글자는 이미지가 아니라 글자로 남아 있어 그대로 인용할 수 있습니다.')

    y = h - 280
    for i, p in enumerate(meta['pages'], start=1):
        c.setFont('Brand', 20)
        c.setFillColorRGB(*ACCENT)
        c.drawString(L, y, f'{i:02d}')
        c.setFont('BodyB', 23)
        c.setFillColorRGB(*INK)
        c.drawString(L + 58, y, p['title'])
        c.setFont('Body', 18)
        c.setFillColorRGB(*MUTED)
        c.drawRightString(w - L, y, p['path'])
        c.setFillColorRGB(*LINE)
        c.rect(L, y - 16, w - L * 2, 0.8, fill=1, stroke=0)
        y -= 50

    if not meta.get('adminIncluded'):
        c.setFont('Body', 17)
        c.setFillColorRGB(*ACCENT)
        c.drawString(L, 96, '※ 운영 화면은 접속 코드가 없어 로그인 화면으로 찍혔습니다.')


def divider(no, title, path):
    def draw(c, w, h):
        L = 110
        c.setFillColorRGB(*ACCENT)
        c.rect(L, h / 2 + 64, 74, 3, fill=1, stroke=0)
        c.setFont('Brand', 30)
        c.setFillColorRGB(*ACCENT)
        c.drawString(L, h / 2 + 8, f'{no:02d}')
        c.setFont('Brand', 56)
        c.setFillColorRGB(*INK)
        c.drawString(L + 80, h / 2 + 8, title)
        c.setFont('Body', 21)
        c.setFillColorRGB(*MUTED)
        c.drawString(L + 80, h / 2 - 38, f"{meta['origin']}{path}")
    return draw


writer = PdfWriter()
writer.add_page(PdfReader(page_bytes(cover)).pages[0])
writer.add_page(PdfReader(page_bytes(toc)).pages[0])

added = 0
for i, p in enumerate(meta['pages'], start=1):
    f = os.path.join(PAGES, f"{p['name']}.pdf")
    if not os.path.exists(f):
        print('없음:', p['name'])
        continue
    writer.add_page(PdfReader(page_bytes(divider(i, p['title'], p['path']))).pages[0])
    for pg in PdfReader(f).pages:
        writer.add_page(pg)
    added += 1

writer.add_metadata({
    '/Title': '집캐치 사업보고',
    '/Subject': '청약·공공임대 기회 CRM — 서비스 화면',
    '/Creator': 'jipcatch',
})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'wb') as fh:
    writer.write(fh)

print(f'화면 {added}개 · 전체 {len(writer.pages)}쪽')
print(OUT)
