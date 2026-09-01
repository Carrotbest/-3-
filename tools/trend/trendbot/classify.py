# -*- coding: utf-8 -*-
"""분류·태깅·관련도 판정. 전부 사전과 가중치로만 한다. LLM을 호출하지 않는다.

세 가지를 판정한다.

1. 관련도 점수 - 소재 개발/혁신 기사만 남기고 패션·유통 기사를 밀어낸다.
2. 분류 - MATERIAL, YARN, FABRIC, CHEMICAL 중 점수가 가장 높은 것.
3. 태그 - 기술 라이브러리 사전과 부분 일치.

관련도는 버리는 판정이 아니라 표시 판정이다. 점수가 낮은 기사도 저장은 하고
relevant=False로만 둔다. 사전을 고친 뒤 rescore를 돌리면 재수집 없이 다시 매겨진다.
"""

import re

MIN_LEN = 2      # 한 글자 매칭어는 오탐을 낸다. 울이 서울에 걸린 사례가 있었다.
ETC = "ETC"

# Target, Amazon처럼 보통명사와 겹치는 이름은 유통 맥락이 함께 있을 때만 바이어로 본다.
RETAIL_CONTEXT = (
    "retailer", "retail", "sourcing", "supplier", "vendor", "order", "assortment",
    "private label", "store", "shopper", "merchand", "inventory", "sales", "buyer",
    "apparel program", "바이어", "유통", "발주", "소싱", "매장", "매출",
)


def _clean_terms(words):
    return [w.lower() for w in words if len(str(w).strip()) >= MIN_LEN]


def _boundary(term):
    """영문 두세 글자 약어는 부분 일치로 잡으면 오탐이 심하다. dwr이 sandworm에 걸린다.

    ASCII 약어만 단어 경계를 강제한다. 한글은 조사가 붙으므로 부분 일치를 유지한다.
    """
    if len(term) <= 4 and re.fullmatch(r"[a-z0-9][a-z0-9\-]*", term):
        return re.compile(r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])")
    return None


class Classifier:
    def __init__(self, tags, categories, relevance, entities=None, excluded_sources=None):
        self.tags = {k: _clean_terms(v) for k, v in tags.items() if not k.startswith("_")}
        self.tags = {k: v for k, v in self.tags.items() if v}
        self.tag_res = {k: {t: _boundary(t) for t in v} for k, v in self.tags.items()}

        self.cat_order = categories.get("_order", [])
        self.cats = {k: _clean_terms(v) for k, v in categories.items() if not k.startswith("_")}
        for name in self.cats:
            if name not in self.cat_order:
                self.cat_order.append(name)
        self.cat_res = {k: {t: _boundary(t) for t in v} for k, v in self.cats.items()}

        # 기사와 바이어를 잇는다. MACRO TREND의 바이어 카드에 관련 기사를 같이 띄운다.
        # 소문자로 눌러 찾으면 Target이 targets에 걸린다. 원문 대소문자를 그대로 본다.
        self.entities, self.ambiguous = {}, set()
        for item in entities or []:
            words = [w.strip() for w in ([item["name"]] + list(item.get("alias", [])))
                     if len(w.strip()) >= 2]
            if not words:
                continue
            self.entities[item["key"]] = words
            if item.get("ambiguous"):
                self.ambiguous.add(item["key"])
        self.entity_res = {
            k: [re.compile(r"(?<![0-9A-Za-z])" + re.escape(w) + r"(?![0-9A-Za-z])")
                if w.isascii() else re.compile(re.escape(w)) for w in v]
            for k, v in self.entities.items()
        }
        self.retail_context = re.compile(
            "|".join(re.escape(w) for w in RETAIL_CONTEXT), re.IGNORECASE)

        raw_gates = relevance.get("gates") or {
            "material": {"threshold": relevance.get("threshold", 5),
                         "category_pool": ["MATERIAL", "YARN", "FABRIC", "CHEMICAL"]},
            "retail": {"threshold": 999, "category_pool": ["RETAIL"]},
        }
        self.gates = raw_gates
        self.threshold = raw_gates["material"]["threshold"]
        self.excluded_sources = set(excluded_sources or [])
        self.source_bias = relevance.get("source_bias", {})
        self.signals = []
        for sig in relevance.get("signals", []):
            terms = _clean_terms(sig.get("terms", []))
            self.signals.append({
                "name": sig.get("name", "?"),
                "gate": sig.get("gate", "material"),
                "weight": sig.get("weight", 0),
                "max_hits": sig.get("max_hits", 2),
                "requires": sig.get("requires"),
                "terms": terms,
                "res": {t: _boundary(t) for t in terms},
            })

    # ---- 내부 ----

    def _hits(self, blob, terms, res):
        found = []
        for term in terms:
            pattern = res.get(term)
            if pattern.search(blob) if pattern else (term in blob):
                found.append(term)
        return found

    # ---- 공개 ----

    def score(self, blob, source, gate="material"):
        """관련도 점수와 근거를 돌려준다. 근거는 사전 튜닝할 때 본다."""
        total = self.source_bias.get(source, 0) if gate == "material" else 0
        why = {}
        counts = {}
        for sig in self.signals:
            if sig["gate"] != gate:
                continue
            hits = self._hits(blob, sig["terms"], sig["res"])
            counts[sig["name"]] = len(hits)
            if not hits:
                continue
            need = sig["requires"]
            if need and not counts.get(need):
                # 전제 신호가 없으면 세지 않는다. 혁신 어휘만 있는 유통 기사를 막는다.
                continue
            capped = min(len(hits), sig["max_hits"])
            total += sig["weight"] * capped
            why[sig["name"]] = hits[:4]
        return total, why

    def category(self, blob, pool=None):
        best, best_score = ETC, 0
        for name in self.cat_order:
            if pool is not None and name not in pool:
                continue
            terms = self.cats.get(name, [])
            n = len(self._hits(blob, terms, self.cat_res.get(name, {})))
            if n > best_score:                       # 동점이면 _order가 앞선 쪽을 남긴다
                best, best_score = name, n
        return best

    def tag(self, blob):
        return [name for name, terms in self.tags.items()
                if self._hits(blob, terms, self.tag_res[name])]

    def entity(self, raw):
        """대소문자를 살린 원문에서 찾는다. blob(소문자)이 아니다."""
        context = bool(self.retail_context.search(raw))
        found = []
        for key, patterns in self.entity_res.items():
            if not any(p.search(raw) for p in patterns):
                continue
            if key in self.ambiguous and not context:
                continue
            found.append(key)
        return found

    def apply(self, record):
        """record를 제자리에서 갱신한다. collect와 rescore가 같은 경로를 쓴다."""
        blob = f"{record.get('title', '')} {record.get('summary', '')}".lower()
        source = record.get("source", "")
        material_score, _ = self.score(blob, source, "material")
        retail_score, _ = self.score(blob, source, "retail")
        material_gate = self.gates["material"]
        retail_gate = self.gates["retail"]
        excluded = source in self.excluded_sources
        if not excluded and material_score >= material_gate["threshold"]:
            record["score"] = material_score
            record["relevant"] = True
            record["gate"] = "material"
            record["category"] = self.category(blob, material_gate.get("category_pool"))
        elif not excluded and retail_score >= retail_gate["threshold"]:
            record["score"] = retail_score
            record["relevant"] = True
            record["gate"] = "retail"
            record["category"] = "RETAIL"
        else:
            record["score"] = max(material_score, retail_score)
            record["relevant"] = False
            record["gate"] = "none"
            record["category"] = ETC
        record["tags"] = self.tag(blob)
        record["entities"] = self.entity(f"{record.get('title', '')} {record.get('summary', '')}")
        return record


def build(cfg_tags, cfg_categories, cfg_relevance, cfg_entities=None, excluded_sources=None):
    return Classifier(cfg_tags, cfg_categories, cfg_relevance, cfg_entities, excluded_sources)
