"""
글꼴을 웹에 실을 만큼으로 줄인다.

원본 TTF·OTF 다섯 벌이 합쳐 10MB 가까이 되고, next/font 가 첫 화면에서
전부 미리 받는다(preload). 휴대폰 회선에서는 이 10MB 가 지도 SDK·공고 데이터·
첫 화면 글자보다 먼저 줄을 서서, 첫 의미 있는 화면이 20초 넘게 늦어졌다.

남기는 글자
  · KS X 1001 완성형 한글 2,350자 — 일상 문장과 공고 제목 거의 전부
  · 한글 호환 자모, ASCII, 라틴-1 기호, 일반 구두점, 화살표, ㎡ 같은 단위,
    CJK 기호·전각 문자, 원문자

빠진 드문 음절(예: 똠·햏)은 시스템 한글 글꼴로 대신 그려진다 — 빈칸이 되지 않는다.
원본은 그대로 두고 *.woff2 를 옆에 만든다. 다시 만들려면:

  pip install fonttools brotli
  python3 scripts/subset-fonts.py
"""
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent / 'app' / 'fonts'
SOURCES = [
    'Pretendard-Regular.otf',
    'Pretendard-Bold.otf',
    'GmarketSansTTFMedium.ttf',
    'GmarketSansTTFBold.ttf',
    'JalnanGothicTTF.ttf',
]


def ksx1001_hangul():
    out = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(ord(bytes([hi, lo]).decode('euc-kr')))
            except UnicodeDecodeError:
                pass
    return out


def codepoints():
    cps = set(ksx1001_hangul())
    ranges = [
        (0x20, 0x7E),      # ASCII
        (0xA0, 0xFF),      # 라틴-1 기호 (· × ÷ ° 등)
        (0x2010, 0x206F),  # 일반 구두점 (— ‘’ “” … ※)
        (0x2190, 0x21FF),  # 화살표
        (0x2460, 0x24FF),  # 원문자
        (0x25A0, 0x25FF),  # 도형 (○●□■△)
        (0x3000, 0x303F),  # CJK 기호 (「」『』〈〉)
        (0x3131, 0x318E),  # 한글 호환 자모
        (0x3200, 0x32FF),  # 괄호·원 한글
        (0x3380, 0x33FF),  # 단위 (㎡ ㎞)
        (0xFF01, 0xFF5E),  # 전각
    ]
    for a, b in ranges:
        cps.update(range(a, b + 1))
    cps.update([0x20A9, 0x2122, 0x2030])  # ₩ ™ ‰
    return sorted(cps)


def main():
    cps = codepoints()
    for name in SOURCES:
        src = ROOT / name
        dst = src.with_suffix('.woff2')
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.name_languages = ['*']
        opts.notdef_outline = True
        opts.glyph_names = False
        opts.hinting = False
        font = subset.load_font(str(src), opts)
        s = subset.Subsetter(opts)
        s.populate(unicodes=cps)
        s.subset(font)
        subset.save_font(font, str(dst), opts)
        print(f'{name:28} {src.stat().st_size/1024:8.0f} KB -> {dst.stat().st_size/1024:6.0f} KB')


if __name__ == '__main__':
    main()
