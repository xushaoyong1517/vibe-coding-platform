// node --test lib/high-temp.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTempC, hGradeStem, isAusteniticNonH, withStructuralHighTemp, highTempAdjust, H_GRADE_C, EXT_BONNET_C } from './high-temp.ts'

test('parseTempC: 多种写法', () => {
  assert.equal(parseTempC('工况650℃'), 650)
  assert.equal(parseTempC('使用温度650度'), 650)
  assert.equal(parseTempC('温度: 538'), 538)
  assert.equal(parseTempC('T=650C'), 650)
  assert.equal(parseTempC('650°C 加长'), 650)
  assert.equal(parseTempC('低温-45℃'), -45)
  assert.equal(parseTempC('加长140/加散热片'), null)  // 140 是长度，不是温度
  assert.equal(parseTempC(''), null)
  assert.equal(parseTempC(undefined), null)
})

test('isAusteniticNonH', () => {
  assert.equal(isAusteniticNonH('F304'), true)
  assert.equal(isAusteniticNonH('304'), true)
  assert.equal(isAusteniticNonH('F316'), true)
  assert.equal(isAusteniticNonH('F304H'), false)  // 已 H 级
  assert.equal(isAusteniticNonH('F304L'), false)  // L 级
  assert.equal(isAusteniticNonH('F6a'), false)    // 13Cr 马氏体
  assert.equal(isAusteniticNonH('Monel'), false)
})

test('hGradeStem: 升 H 级，幂等', () => {
  assert.equal(hGradeStem('F304'), 'F304H')
  assert.equal(hGradeStem('304'), 'F304H')
  assert.equal(hGradeStem('F316'), 'F316H')
  assert.equal(hGradeStem('F304H'), 'F304H')   // 幂等
  assert.equal(hGradeStem('F6a'), 'F6a')        // 非奥氏体不动
  assert.equal(hGradeStem('F304L'), 'F304L')    // L 级不动
})

test('withStructuralHighTemp: 补加长+散热，幂等', () => {
  assert.equal(withStructuralHighTemp('工况650℃'), '工况650℃；加长阀盖+散热片')
  assert.equal(withStructuralHighTemp(''), '加长阀盖+散热片')
  assert.equal(withStructuralHighTemp('已加长140'), '已加长140')      // 已含"加长"不重复
  assert.equal(withStructuralHighTemp('加散热片'), '加散热片')         // 已含"散热"不重复
})

test('highTempAdjust: 650℃ 同时升H+补结构', () => {
  const r = highTempAdjust({ 阀杆轴: 'F304', 特殊: '工况650℃' })
  assert.equal(r.tempC, 650)
  assert.equal(r.patch.阀杆轴, 'F304H')
  assert.equal(r.patch.特殊, '工况650℃；加长阀盖+散热片')
  assert.deepEqual(new Set(r.changed), new Set(['阀杆轴', '特殊']))
})

test('highTempAdjust: 450℃ 仅补结构（未到H级阈值）', () => {
  assert.ok(450 >= EXT_BONNET_C && 450 < H_GRADE_C)
  const r = highTempAdjust({ 阀杆轴: 'F304', 特殊: '温度450' })
  assert.equal(r.patch.阀杆轴, undefined)            // 未升 H
  assert.equal(r.patch.特殊, '温度450；加长阀盖+散热片')
  assert.deepEqual(r.changed, ['特殊'])
})

test('highTempAdjust: 常温 → 无变化', () => {
  const r = highTempAdjust({ 阀杆轴: 'F304', 特殊: '客户指定佐敦牌油漆' })
  assert.equal(r.tempC, null)
  assert.deepEqual(r.changed, [])
})

test('highTempAdjust: 备注里的温度也识别', () => {
  const r = highTempAdjust({ 阀杆轴: 'F316', 特殊: '', 备注: '使用温度650度' })
  assert.equal(r.tempC, 650)
  assert.equal(r.patch.阀杆轴, 'F316H')
})
