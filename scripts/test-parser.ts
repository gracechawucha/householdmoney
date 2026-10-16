import assert from 'node:assert/strict'
import { isBalanceEnquiry, parseMpesa } from '../supabase/functions/ingest/parser.ts'

const samples = {
  paidPerson:
    'UJDFWA5LE9 Confirmed. Ksh30.00 paid to GRACE MUTHONI MUCHIRA. on 13/10/26 at 9:27 AM.New M-PESA balance is Ksh614.36. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,970.00. See all your balances now https://saf.cx/kWQpy',
  paidTingg:
    'UJDFWA77DY Confirmed. Ksh23.00 paid to TINGG. on 13/10/26 at 3:34 PM.New M-PESA balance is Ksh591.36. Transaction cost, Ksh0.00. Amount you can transact within the day is 499,947.00. See all your balances now https://saf.cx/kWQpy',
  received:
    'UJCPQ9ZJDP Confirmed.You have received Ksh1,000.00 from Grace  Kilunju 0712***472 on 12/10/26 at 8:29 PM  New M-PESA balance is Ksh1,504.36. Invest & earn daily interest with ZIIDI on https://saf.cx/cF6ir',
  sent:
    'UJE1A2B3C4 Confirmed. Ksh500.00 sent to JOHN DOE 0712345678 on 13/10/26 at 12:05 PM. New M-PESA balance is Ksh1,000.00. Transaction cost, Ksh7.00. Amount you can transact within the day is 499,500.00.',
  paybill:
    'UJE9Z8Y7X6 Confirmed. Ksh1,250.00 sent to KPLC PREPAID for account 14162345 on 11/10/26 at 12:00 AM. New M-PESA balance is Ksh300.50. Transaction cost, Ksh0.00.',
  mshwariOut:
    'UJF1A2B3C4 Confirmed. Ksh9,000.00 transferred to M-Shwari account on 12/10/26 at 8:31 PM. M-Shwari balance is Ksh9,100.00. New M-PESA balance is Ksh1,504.36. Transaction cost, Ksh0.00.',
  mshwariIn:
    'UJF9Z8Y7X6 Confirmed. Ksh400.00 transferred from M-Shwari account on 13/10/26 at 7:05 AM. M-Shwari balance is Ksh8,700.00. New M-PESA balance is Ksh1,904.36.',
  promo: 'Dear customer, enjoy 10% off at ... ',
}

const a = parseMpesa(samples.paidPerson)!
assert.equal(a.code, 'UJDFWA5LE9')
assert.equal(a.direction, 'out')
assert.equal(a.amount, 30)
assert.equal(a.counterparty, 'GRACE MUTHONI MUCHIRA')
assert.equal(a.balanceAfter, 614.36)
assert.equal(a.fee, 0)
assert.equal(a.occurredAt, '2026-10-13T06:27:00.000Z') // 9:27 EAT

const b = parseMpesa(samples.paidTingg)!
assert.equal(b.counterparty, 'TINGG')
assert.equal(b.occurredAt, '2026-10-13T12:34:00.000Z') // 15:34 EAT

const c = parseMpesa(samples.received)!
assert.equal(c.direction, 'in')
assert.equal(c.amount, 1000)
assert.equal(c.counterparty, 'GRACE KILUNJU')
assert.equal(c.counterpartyPhone, '0712***472')
assert.equal(c.balanceAfter, 1504.36)
assert.equal(c.fee, 0)
assert.equal(c.occurredAt, '2026-10-12T17:29:00.000Z') // 20:29 EAT

const d = parseMpesa(samples.sent)!
assert.equal(d.txType, 'sent')
assert.equal(d.counterparty, 'JOHN DOE')
assert.equal(d.counterpartyPhone, '0712345678')
assert.equal(d.fee, 7)

const e = parseMpesa(samples.paybill)!
assert.equal(e.counterparty, 'KPLC PREPAID')
assert.equal(e.accountRef, '14162345')
assert.equal(e.amount, 1250)
assert.equal(e.occurredAt, '2026-10-10T21:00:00.000Z') // 12:00 AM EAT = 21:00 UTC previous day

assert.equal(parseMpesa(samples.promo), null)

// Balance chain: 614.36 - 23 = 591.36  (sample 1 -> sample 2)
assert.equal(+(a.balanceAfter! - b.amount - b.fee).toFixed(2), b.balanceAfter)

console.log('parser: all checks passed')

const m1 = parseMpesa(samples.mshwariOut)!
assert.equal(m1.txType, 'mshwari')
assert.equal(m1.direction, 'out')
assert.equal(m1.counterparty, 'M-SHWARI')
assert.equal(m1.balanceAfter, 1504.36) // the M-PESA balance, not the M-Shwari one

const m2 = parseMpesa(samples.mshwariIn)!
assert.equal(m2.txType, 'mshwari')
assert.equal(m2.direction, 'in')
assert.equal(m2.balanceAfter, 1904.36)

console.log('M-Shwari parser checks passed')

const eq = parseMpesa(
  'UJBTT7A5YX Confirmed.  Ksh200.00   transferred to Equity Paybill Account for account 331351#Tithes on 11/10/26 at 12:39 PM. Merchant Account Balance is Ksh1,889.93.',
)!
assert.equal(eq.direction, 'out')
assert.equal(eq.amount, 200)
assert.equal(eq.accountRef, '331351#Tithes')
assert.equal(eq.balanceAfter, null) // merchant balance must not enter the M-PESA chain

const till = parseMpesa(
  'UJFFWAH2C8 Confirmed. Ksh200.00 sent to LLOYD   MWANGI 0746183991 on 15/10/26 at 7:00 PM. . New Merchant Account Balance is Ksh129.93. Transaction cost, Ksh0.00.',
)!
assert.equal(till.balanceAfter, null)

assert.ok(isBalanceEnquiry('UJFFWAE9UP Confirmed . Your M-Shwari Deposit Account balance is Ksh103.85 .Transaction cost Ksh 0.00.'))
assert.ok(isBalanceEnquiry('UIQFW84E4M Confirmed. Your account balance was: M-PESA Account : Ksh343.89 M-PESA Pochi Account : Ksh0.00 on 26/9/26 at 7:08 PM.'))
console.log('merchant / enquiry parser checks passed')
