/**
 * 주거비 환산 — 보증금을 매달 비용으로 옮긴다. (홈의 주거비 계산기와 세 갈래 비교가 함께 쓴다)
 *
 * 순수 함수만 둔다. `node --test` 가 그대로 불러 검사한다.
 * 금액 단위는 만원, 금리는 연 %.
 *
 *  - 실제 현금지출: 월 임대료 + 관리비 + 대출 이자 — 통장에서 실제로 나가는 돈
 *  - 기회비용: 내 돈으로 낸 보증금이 예금이었다면 받았을 이자 — 나가지는 않지만 잃는 돈
 * 보증금 원금은 돌려받으므로 비용에 넣지 않는다. 대신 처음에 마련해야 할 현금으로 따로 적는다.
 */

export interface CostInput {
  deposit: number
  rent: number
  fee: number
  /** 보증금 중 대출 비율 % */
  loanPct: number
  loanRate: number
  saveRate: number
}

export interface MonthlyCost {
  loan: number
  /** 처음에 마련해야 할 내 돈 (보증금 − 대출) */
  own: number
  rent: number
  fee: number
  interest: number
  forgone: number
  cash: number
  total: number
}

export function monthlyCost(i: CostInput): MonthlyCost {
  const loan = (i.deposit * i.loanPct) / 100
  const own = i.deposit - loan
  const interest = (loan * i.loanRate) / 100 / 12
  const forgone = (own * i.saveRate) / 100 / 12
  const cash = i.rent + i.fee + interest
  return { loan, own, rent: i.rent, fee: i.fee, interest, forgone, cash, total: cash + forgone }
}

/** 0개월부터 months 개월까지의 누적 (첫 칸은 0) */
export function cumulative(i: CostInput, months: number) {
  const m = monthlyCost(i)
  const cash: number[] = []
  const total: number[] = []
  for (let k = 0; k <= months; k++) {
    cash.push(m.cash * k)
    total.push(m.total * k)
  }
  return { cash, total, monthly: m }
}
