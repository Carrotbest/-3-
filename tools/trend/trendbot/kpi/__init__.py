# -*- coding: utf-8 -*-
"""KPI 수집기 모음.

두 갈래다.
  buyers  - 바이어(상장 유통사)의 분기 매출·재고. 미국 SEC 공시가 원천이다.
  gov     - 정부·국제기구 공개 통계. 면화가, 유가, 미국 의류 수입.

전부 공개 데이터만 쓴다. 사내 실적·단가는 여기 넣지 않는다.
"""

from . import census, fred, manual, sec_edgar, worldbank

COLLECTORS = {
    "sec_edgar": sec_edgar.collect,
    "worldbank": worldbank.collect,
    "census": census.collect,
    "manual": manual.collect,
    "fred": fred.collect,
}
