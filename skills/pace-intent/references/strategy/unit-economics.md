---
id: unit-economics
title: Unit economics
group: strategy
types: [business, platform]
depth: [L3]
signals: ["수수료", "구독", "가격", "수익", "광고", money flows, "남는 구조"]
source: David Skok, "SaaS Metrics 2.0" (For Entrepreneurs, 2013) — unit economics, CAC, LTV, payback
---

## Looks at

Whether one transaction (or one customer) makes money: revenue per unit, variable cost per unit, acquisition cost, retention, and payback time.

## Key questions

- What is the unit — an order, a booking, a subscriber, a matched job?
- Revenue per unit after payment fees and refunds; variable cost per unit (hosting, AI generation, support, payouts)?
- What does it cost to acquire one paying customer, and how long until that cost is paid back?
- At what volume does the fixed cost get covered?

## Common gaps

- AI or API cost per unit omitted (generation, storage, SMS).
- Take rate chosen without the payment processor's fee.
- Retention assumed, so lifetime value is a guess presented as a number.

## Turning gaps into questions

Compute with labelled assumptions; ask only for the price or take-rate decision the user owns, recommending the one that keeps margin positive with the stated costs.
Example: "수수료를 얼마로 시작할까요? ① 거래액의 X%(추천 — 가정한 결제 수수료를 빼도 단위당 남는 가장 낮은 값) ② 더 낮게 ③ 월 구독만 · 직접 입력 — 단위당 남는 돈과 공급자 이탈 위험이 달라져요."
Payment-processor fees and payout rules are external facts — confirm them on the official price page with the checked date (D8); until then the number is a labelled `가정`.

## Tensions

- With **network effects**: subsidising one side to grow hurts unit margin — ask "how many months of negative margin per unit are acceptable to seed the network?"
- With **MoSCoW**: cost-cutting features (automation) compete with growth features — ask which comes first.

## When not to use

Requests without revenue; when the user explicitly postpones the revenue model (keep it `미결` instead of computing guesses).

## Output form

Form: one unit table — 단위 · 매출 · 변동비(항목별) · 기여 이익 · 획득비 · 회수 기간 — each number marked 근거/가정.
Link to first layer: lean canvas revenue and cost blocks; assumption map ranks the riskiest numbers.
When to produce: L3 business plans (an L2 plan that turns into selling moves to L3 first).

## Closing

End with two sentences — unit contribution ("수수료 X%면 단위당 Y원 남음") and break-even volume ("고정비 F를 덮으려면 주 N건") — and the single number to validate first.

## Source

David Skok, "SaaS Metrics 2.0 – A Guide to Measuring and Improving What Matters" (forEntrepreneurs.com, 2013): contribution margin, CAC, LTV, CAC payback. Concepts rewritten; no text copied.
