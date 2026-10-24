import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { inspectWorkbook, seatKey } from '../src/workbook.js';

async function accessWorkbook(rows) {
  const workbook=new ExcelJS.Workbook(), sheet=workbook.addWorksheet('Hoja 1');
  sheet.addRow(['Reporte de Historial de Accesos']); sheet.addRow([]);
  sheet.addRow(['INGRESO','TIPO DE REGISTRO','ZONA','SECCIÓN','ASIENTO','NOMBRE','CORREO ELECTRÓNICO','TELÉFONO','TIPO','COMPRA','CÓDIGO DE BARRAS','PARÁMETRO','PATROCINADOR','DISPOSITIVO','RONDA','EVENTO LIGADO','PRECIO']);
  rows.forEach(row=>sheet.addRow(row)); return workbook.xlsx.writeBuffer();
}

async function salesWorkbook(rows) {
  const workbook=new ExcelJS.Workbook(), sheet=workbook.addWorksheet('Hoja 1');
  sheet.addRow(['Reporte de Órdenes']); sheet.addRow([]);
  sheet.addRow(['NÚMERO DE ORDEN','CÓDIGO DE COMPRA','*NOMBRE','*CORREO ELECTRÓNICO','*TELÉFONO','TIPO','PARÁMETRO','ZONA','SECCIÓN','ASIENTO','CÓDIGO DE BARRAS','EVENTO','PRECIO']);
  rows.forEach(row=>sheet.addRow(row)); return workbook.xlsx.writeBuffer();
}

test('doble escaneo del mismo programa y partido cuenta una sola vez',async()=>{
  const row=['21/10/26 20:10','Entrada','VIP','210','A-1','TITULAR','-','-','Abono','123','99999999999999999999','-','-','D','Principal','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','1'];
  const key=seatKey('123','VIP','210','A-1');
  const result=await inspectWorkbook(await accessWorkbook([row,row]),{kind:'access',knownPrograms:new Map([[key,{id:'program-1'}]])});
  assert.equal(result.included.length,1); assert.equal(result.duplicates.length,1);
});

test('cortesía y compromisos no ingresan al programa',async()=>{
  const result=await inspectWorkbook(await accessWorkbook([
    ['21/10/26 20:10','Entrada','VIP','210','A-1','-','-','-','Cortesía abono','123','9','-','-','D','Principal','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','-'],
    ['21/10/26 20:11','Entrada','VIP','210','A-2','-','-','-','Abono','124','8','PATROCINIO','-','D','Principal','Abono Compromisos LMP 2026-27','1']
  ]),{kind:'access',knownPrograms:new Map()});
  assert.equal(result.included.length,0); assert.equal(result.excluded.length,2);
});

test('suites, colaborador y precios cero o uno se excluyen aunque vengan formateados',async()=>{
  const event='Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const result=await inspectWorkbook(await salesWorkbook([
    ['1','A','UNO','-','-','Abono','-','SUITES','1','A-1','1',event,'$20,000.00'],
    ['2','B','DOS','-','-','Abono Colaborador','-','VIP','1','A-2','2',event,'$20,000.00'],
    ['3','C','TRES','-','-','Abono','-','VIP','1','A-3','3',event,'$0.00'],
    ['4','D','CUATRO','-','-','Abono','-','VIP','1','A-4','4',event,'$1.00'],
    ['5','E','CINCO','-','-','Abono','-','VIP','1','A-5','5',event,'$20,145.00']
  ]),{kind:'sales'});
  assert.equal(result.excluded.length,4);
  assert.equal(result.included.length,1);
  assert.equal(result.included[0].orderNumber,'5');
});
