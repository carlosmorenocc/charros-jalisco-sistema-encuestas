import test from 'node:test'
import assert from 'node:assert/strict'
import { previewAccessRows, previewSalesRows } from '../src/lib/rewardWorkbook.js'

test('ventas usa orden + ubicación y conserva promociones para revisión', () => {
  const rows = [
    ['Reporte'],
    [],
    ['NÚMERO DE ORDEN','EVENTO','ZONA','SECCIÓN','ASIENTO','TIPO','PRECIO','PARÁMETRO','EMPRESA'],
    ['1001','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','VIP','210','F-2','25%','20145','',''],
    ['1002','Charros de Jalisco: Abono General Charros LMP 2026-2027','General','411','A-1','Abono Colaborador','1','',''],
    ['1003','Abono Compromisos LMP 2026-27','Suite','S1','1','Normal','1','Patrocinio','Empresa'],
  ]
  const result = previewSalesRows(rows)
  assert.equal(result.accepted.length, 2)
  assert.deepEqual(result.accepted[1].flags, ['commercial_eligibility_review'])
  assert.equal(result.excluded[0].reason, 'commitment')
})

test('accesos acepta solo TIPO Abono elegible y deduplica escaneos', () => {
  const rows = [
    ['Reporte'], [],
    ['INGRESO','ZONA','SECCIÓN','ASIENTO','TIPO','COMPRA','EVENTO LIGADO','PARÁMETRO','PATROCINADOR'],
    ['22/10/26 19:00','VIP','210','F-2','Abono','1001','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','',''],
    ['22/10/26 19:05','VIP','210','F-2','Abono','1001','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','',''],
    ['22/10/26 19:10','VIP','210','F-3','Cortesía abono','1001','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','',''],
  ]
  const result = previewAccessRows(rows)
  assert.equal(result.accepted.length, 1)
  assert.equal(result.review[0].reason, 'duplicate_scan')
  assert.equal(result.excluded[0].reason, 'ineligible_access')
})
