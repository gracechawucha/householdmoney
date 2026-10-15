import type { Category, Tx } from './types'

/**
 * "Quick sort": suggestions for the many small payments that are almost always
 * groceries or transport. Nothing is applied without a review.
 */

const FEMALE = new Set(
  `MARY GRACE ESTHER MERCY IRENE TERESIAH TERESA JOYCE PHOEBI PHOEBE RUTH JACKLINE JACQUELINE CATHERINE VERONICAH VERONICA DAMARIS HELLEN HELEN SUSAN ELIZABETH HANNAH HANAH ROSE ROSEMARY PURITY NANCY MONICAH MONICA LYDIAH LYDIA BEATRICE MOREEN JACINTA JANE MARGARET LILIAN LIZKA SHEILAH ANNASTASIA ANASTASIA FELISTER JEMIMAH CHRISTINE FAITH LUCY ANN ANNE ANNA CAROLINE CAROLYNE SARAH SARA WINNIE EUNICE GLADYS JUDY JUDITH AGNES ALICE REBECCA REBECCAH NAOMI LEAH RACHEL RAHAB DORCAS DORCAS BERNICE BRENDA CYNTHIA DIANA DORIS EVERLYNE EVELYN EVALINE FLORENCE HILDA JOAN JOANNE JOSPHINE JOSEPHINE JULIET JULIA KENDI LINDA LORNA MAUREEN MILLICENT NELLY NJERI WANJIRU WAMBUI WANJIKU WANGUI WAIRIMU NYAMBURA WANGARI MUTHONI NYOKABI WACERA MUMBI NJOKI WAITHERA AKINYI ATIENO ACHIENG ADHIAMBO AWINO KEREN PAULINE PRISCILLA PRISCAH RISPER SALOME STELLA TABITHA VIOLET VIVIAN WINFRED YVONNE ZIPPORAH CHEBET CHEROTICH JEPKOECH KEMUNTO MORAA KERUBO EMMY EMILY ESTHA FRIDAH NJERU`
    .split(/\s+/),
)
const MALE = new Set(
  `JAMES BENARD BERNARD FRANCIS SAMUEL PETER JOEL CHRISTOPHER NOAH DANIEL KENETH KENNETH DENNIS JACOB DAVID KIPLANGAT GEORGE STEPHEN DERICK DERRICK MARTIN PATRICK FREDRICK FREDERICK DOMINIC BONIFACE WILLINGTON JOSEPH JOHN PAUL MARK MICHAEL MOSES ISAAC ISAIAH SIMON ANDREW ANTHONY BRIAN BRIAN CALEB CHARLES COLLINS DENIS DICKSON DUNCAN EDWIN ELIJAH ERIC EVANS GEOFFREY GIDEON HARRISON HENRY IAN JACKSON JEREMIAH JOHNSON JOSHUA KELVIN KEVIN LAWRENCE LEONARD MAURICE MWANGI KAMAU KIMANI KARIUKI NJOROGE MAINA OTIENO OCHIENG OMONDI ODHIAMBO NICHOLAS NELSON OSCAR PHILIP RAPHAEL RICHARD ROBERT SAMSON SOLOMON STANLEY TIMOTHY VICTOR VINCENT WILFRED WILLIAM WILSON ALEX ALEXANDER ABRAHAM ALFRED ALLAN AMOS BENJAMIN BENSON CLINTON EMMANUEL FELIX GILBERT JOSEPHAT JULIUS LEVI MATHEW MATTHEW MORRIS NATHAN NOEL SYLVESTER TITUS ZACHARIA`
    .split(/\s+/),
)

export type Gender = 'f' | 'm' | '?'

export function genderOf(name: string | null): Gender {
  const toks = (name ?? '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean)
  if (!toks.length) return '?'
  if (FEMALE.has(toks[0])) return 'f'
  if (MALE.has(toks[0])) return 'm'
  // first name unknown: look for a clear name further along (e.g. "ASKAH WANJIRU")
  if (toks.slice(1).some((t) => FEMALE.has(t))) return 'f'
  return '?'
}

const hourEAT = (iso: string) =>
  Number(new Date(iso).toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Nairobi' })) % 24

/** matatu-style payees: a plate ("KDQ 453R"), a sacco, a movers/shuttle/express till */
const VEHICLE = /\b[A-Z]{3} ?\d{3}[A-Z]\b|\b(MOVERS|SACCO|SHUTTLE|EXPRESS|MATATU|KAPU TECH)\b/i
const TRANSPORT_AMOUNTS = new Set([60, 80, 100, 110])

export interface SuggestItem {
  tx: Tx
  /** shown next to the row */
  why: string
  /** pre-ticked when the signal is strong */
  strong: boolean
}

export interface SuggestGroup {
  id: 'transport' | 'groceries'
  title: string
  blurb: string
  category: Category
  items: SuggestItem[]
}

export function suggest(txs: Tx[], cats: Category[]): SuggestGroup[] {
  const find = (name: string) => cats.find((c) => c.kind === 'expense' && !c.archived && c.name.toLowerCase() === name)
  const transportCat = find('transport')
  const groceriesCat = find('groceries')

  const transport: SuggestItem[] = []
  const groceries: SuggestItem[] = []

  for (const t of txs) {
    if (t.status !== 'unlabeled' || t.direction !== 'out') continue
    if (t.tx_type !== 'paid' && t.tx_type !== 'sent') continue
    if (/SHWARI|TINGG/i.test(t.counterparty ?? '')) continue
    const g = genderOf(t.counterparty)
    const h = hourEAT(t.occurred_at)
    const rush = (h >= 5 && h <= 9) || (h >= 16 && h <= 20) // morning or evening
    const pochi = t.tx_type === 'paid' && !t.counterparty_phone // a name paid without a phone: Pochi la Biashara or a till

    // transport first: a 60/80/100/110 fare at rush hour to a man, or to a matatu-style payee
    if (transportCat) {
      if (VEHICLE.test(t.counterparty ?? '') && t.amount <= 200) {
        transport.push({ tx: t, why: 'Matatu / sacco payee', strong: true })
        continue
      }
      if (TRANSPORT_AMOUNTS.has(t.amount) && rush && g === 'm') {
        transport.push({ tx: t, why: `${pochi ? 'Pochi · ' : ''}${h < 12 ? 'morning' : 'evening'} fare to a man`, strong: true })
        continue
      }
    }

    // groceries: anything under 100
    if (groceriesCat && t.amount < 100) {
      groceries.push({
        tx: t,
        why: g === 'f' ? 'Under 100, to a woman' : g === 'm' ? 'Under 100, to a man: check' : 'Under 100, name unclear',
        strong: g === 'f',
      })
    }
  }

  const out: SuggestGroup[] = []
  if (transportCat && transport.length)
    out.push({
      id: 'transport',
      title: 'Transport',
      blurb: '60, 80, 100 or 110 Ksh at morning or evening hours to a man, plus matatu and sacco payees.',
      category: transportCat,
      items: transport,
    })
  if (groceriesCat && groceries.length)
    out.push({
      id: 'groceries',
      title: 'Groceries',
      blurb: 'Under Ksh 100. Ticked when it went to a woman; the rest are for you to check.',
      category: groceriesCat,
      items: groceries,
    })
  return out
}
