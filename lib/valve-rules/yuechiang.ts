import type { FactoryRuleset, Pai1Family, Pai2Trim } from './types'

// 越强阀门 · 牌1/牌2 基线规则集
// 来源：越强《阀门主要零部件材质表》(牌1) + 《API600件号对应表》(牌2)
// 取值与导入的 valve_rules_pai1_pai2.json / CSV 三份一致（"新数据集"）。
// 注：与旧 bom-generate.md 相比，本数据集做了 3 处取舍，详见文末 DEVIATIONS。

const pai1: Record<string, Pai1Family> = {
  WCB: {
    desc: '碳钢铸钢(A216 WCB)',
    applies_to: ['C', 'WCB'],
    body: 'A216 WCB', bonnet: 'A216 WCB',
    seat_base: 'A105+13Cr/STL', disc_base: 'A216 WCB',
    stem: '20Cr13/12Cr13', gasket: '304+柔性石墨',
    stud: 'A193 B7', nut: 'A194 2H',
    packing: '柔性石墨+缠绕填料', packing_sleeve: '12Cr13', packing_plate: 'A216 WCB',
    yoke: 'A216 WCB', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  WC_alloy: {
    desc: '铬钼钢铸钢(A217 WC1/WC6/WC9/C5/CA15)',
    applies_to: ['V3', 'WC6', 'WC1', 'WC9', 'C5', 'CA15'],
    body: 'A217 WC1/WC6/WC9/C5/CA15', bonnet: 'A217 WC1/WC6/WC9/C5/CA15',
    seat_base: 'A182 F11/F22+STL', disc_base: 'A217 WC1/WC6/WC9/C5/CA15',
    stem: '25Cr2Mo1V/316H/304H', gasket: '304+柔性石墨',
    stud: 'A193 B16', nut: 'A194-4',
    packing: '柔性石墨+缠绕填料', packing_sleeve: 'F304', packing_plate: 'A217 WC1/WC6/WC9/C5/CA15',
    yoke: 'A217 WC1/WC6/WC9/C5/CA15', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  C12A: {
    desc: '9铬钢铸钢(A217 C12A)',
    applies_to: ['C12A'],
    body: 'A217 C12A', bonnet: 'A217 C12A',
    seat_base: 'A182 F91+STL', disc_base: 'A217 C12A',
    stem: '25Cr2Mo1V', gasket: '304+柔性石墨',
    stud: 'A193 B16', nut: 'A194-4',
    packing: '柔性石墨+缠绕填料', packing_sleeve: 'F304', packing_plate: 'A217 C12A',
    yoke: 'A217 C12A', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  CF8: {
    desc: '304不锈钢铸钢(A351 CF8/CF3)',
    applies_to: ['P', 'CF8', 'CF3'],
    body: 'A351 CF8/CF3', bonnet: 'A351 CF8/CF3',
    seat_base: 'A182 F304/F304L+STL', disc_base: 'A351 CF8/CF3',
    stem: 'F304/F304L', gasket: '304+柔性石墨',
    stud: 'A320 B8', nut: 'A194-8',
    packing: '柔性石墨+缠绕填料', packing_sleeve: 'F304', packing_plate: 'A351 CF8/CF3',
    yoke: 'A351 CF8/CF3', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  CF8M: {
    desc: '316不锈钢铸钢(A351 CF8M/CF3M/CF8C)',
    applies_to: ['R', 'CF8M', 'RL', 'CF3M', 'CF8C'],
    body: 'A351 CF8M/CF3M/CF8C', bonnet: 'A351 CF8M/CF3M/CF8C',
    seat_base: 'A182 F316/F316L+STL', disc_base: 'A351 CF8M/CF3M/CF8C',
    stem: 'A182 F316/F316L', gasket: '316+柔性石墨',
    stud: 'A193 B8M', nut: 'A194-8M',
    packing: '柔性石墨+缠绕填料', packing_sleeve: 'A182 F316/F316L', packing_plate: 'A351 CF8M/CF3M/CF8C',
    yoke: 'A351 CF8M/CF3M/CF8C', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  LCB: {
    desc: '低温铸钢(LCB/LCC/LC1/LC2/LC3)',
    applies_to: ['C2', 'LCB', 'LCC', 'LC1', 'LC2', 'LC3'],
    body: 'LCB/LCC/LC1/LC2/LC3', bonnet: 'LCB/LCC/LC1/LC2/LC3',
    seat_base: '16Mn/LF2+STL', disc_base: 'LCB/LCC/LC1/LC2/LC3',
    stem: '1Cr17Ni2', gasket: '304+柔性石墨',
    stud: 'A320-L7', nut: 'A194-4',
    packing: '柔性石墨+缠绕填料', packing_sleeve: 'F304', packing_plate: 'LCB/LCC/LC1/LC2/LC3',
    yoke: 'LCB/LCC/LC1/LC2/LC3', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  Monel_20alloy: {
    desc: '蒙乃尔/20合金钢(Monel/20合金)',
    applies_to: ['Monel', '20alloy', 'N1', 'N4'],
    body: 'Monel/20合金', bonnet: 'Monel/20合金+STL',
    seat_base: 'Monel/20合金+STL', disc_base: 'Monel/20合金',
    stem: 'Monel/20合金', gasket: '316+柔性石墨',
    stud: '0Cr17Ni12Mo2/A193 B8M', nut: '0Cr17Ni12Mo2/A194-8M',
    packing: '柔性石墨+缠绕填料', packing_sleeve: 'Monel/20合金', packing_plate: 'Monel/20合金',
    yoke: 'Monel/20合金', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
  super_alloy: {
    desc: '超级合金钢(F51/F53/F55双相钢, INCONEL600/625, INCOLOY800, F304H/F316H)',
    applies_to: ['F51', 'F53', 'F55', 'INCONEL600', 'INCONEL625', 'INCOLOY800', 'F304H', 'F316H'],
    body: 'F51/F53/F55 或 INCONEL600/625/INCOLOY800 或 F304H/F316H', bonnet: '合金体',
    seat_base: '合金体+STL', disc_base: '合金体+STL',
    stem: 'F51/F53/F55 或 INCONEL600/625/INCOLOY800 或 F304H/F316H', gasket: '316+柔性石墨',
    stud: 'A193 B8M', nut: 'A194-8M',
    packing: '柔性石墨+缠绕填料', packing_sleeve: '合金体', packing_plate: '合金体',
    yoke: '合金体', stem_nut: 'ZQAL9-4', handwheel: 'KTH350-10',
  },
}

// 牌2：列顺序 gate_seal, seat_seal, stem, backseat, packing_sleeve, spacer, packing_gasket
const t = (
  gate: string, seat: string, stem: string, back: string,
  sleeve: string, spacer: string, gasket: string,
  alias: string, freq: Pai2Trim['freq'],
): Pai2Trim => ({
  gate_seal: gate, seat_seal: seat, stem, backseat: back,
  packing_sleeve: sleeve, spacer, packing_gasket: gasket, alias, freq,
})

const pai2: Record<string, Pai2Trim> = {
  '1':  t('Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr19', '普通/全13Cr', 'high'),
  '2':  t('304', '304', '304', '304', '304', '304', '304', '304本体/全304', 'med'),
  '3':  t('310', '310', '310', '310', '310', 'Cr13', 'Cr13', '310', 'low'),
  '4':  t('硬Cr14', '硬Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', '硬铬', 'low'),
  '5':  t('HF(STL)', 'HF(STL)', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'STL堆焊', 'high'),
  '6':  t('Cu-Ni', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', '铜镍', 'low'),
  '7':  t('Cr13', '硬Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13+硬Cr13', 'low'),
  '8':  t('Cr13', 'HF(STL)', 'Cr13', 'Cr13', 'Cr13', 'Cr13', 'Cr13', '硬面/13Cr闸板+STL阀座', 'high'),
  '9':  t('Monel', 'Monel', 'Monel', 'Monel', 'Monel', 'Monel', 'Monel', '全蒙乃尔', 'med'),
  '10': t('316', '316', '316', '316', '316', '316', '316', '316本体/全316', 'med'),
  '11': t('Monel', 'HF(STL)', 'Monel', 'Monel', 'Monel', 'Monel', 'Monel', 'Monel+STL', 'low'),
  '12': t('316', 'HF(STL)', '316', '316', '316', '316', '316', '316+STL', 'med'),
  '13': t('20号合金', '20号合金', '20号合金', '20号合金', '20号合金', '20号合金', '20号合金', '全20合金', 'low'),
  '14': t('HF(STL)', '20号合金', '20号合金', '20号合金', '20号合金', '20号合金', '20号合金', 'STL+20合金', 'low'),
  '15': t('HF(STL)', 'HF(STL)', '304', '304', '304', '304', '304', 'STL密封+304内件', 'med'),
  '16': t('HF(STL)', 'HF(STL)', '316', '316', '316', '316', '316', 'STL密封+316内件', 'med'),
  '17': t('HF(STL)', 'HF(STL)', '347', '347', '347', '347', '347', 'STL密封+347内件', 'low'),
  '18': t('HF(STL)', 'HF(STL)', '20号合金', '20号合金', '20号合金', '20号合金', '20号合金', 'STL密封+20合金内件', 'low'),
  'B':  t('青铜', '青铜', '青铜', '青铜', '青铜', '青铜', '青铜', '全青铜', 'low'),
  'AB': t('铝青铜', '铝青铜', '铝青铜', '铝青铜', '铝青铜', '铝青铜', '铝青铜', '全铝青铜', 'low'),
}

export const yuechiangRuleset: FactoryRuleset = {
  factory_id: 'yuechiang',
  pai1,
  pai2,
}

// DEVIATIONS（相对旧 bom-generate.md，待与师傅最终确认）：
//  ① 件号「普通」与「1#」合并为 '1'，填料垫取 Cr19（旧 1# 为 Cr13）。
//  ② 件号 '3' 填料压套取 310（旧 md 为 Cr13）。
//  ③ 件号 'AB' 填料垫取 铝青铜（旧 md 为 青铜）。
