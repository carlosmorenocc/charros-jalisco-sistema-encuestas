import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { inspectWorkbook, parseAccessTimestamp, seatKey } from '../src/workbook.js';

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

test('la llave de conciliacion tolera guiones y espacios de formato en la butaca',() => {
  assert.equal(
    seatKey('123','VIP','210','AA-2'),
    seatKey('123','VIP','210',' AA 2 ')
  );
});

test('doble escaneo del mismo programa y partido cuenta una sola vez',async()=>{
  const row=['21/10/26 20:10','Entrada','VIP','210','A-1','TITULAR','-','-','Abono','123','99999999999999999999','-','-','D','Principal','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','1'];
  const key=seatKey('123','VIP','210','A-1');
  const result=await inspectWorkbook(await accessWorkbook([row,row]),{kind:'access',knownPrograms:new Map([[key,{id:'program-1'}]])});
  assert.equal(result.included.length,1); assert.equal(result.duplicates.length,1);
});

test('cortesía abono cuenta solo al conciliar con el padrón; compromisos y patrocinadores se excluyen',async()=>{
  const event='Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const result=await inspectWorkbook(await accessWorkbook([
    ['21/10/26 20:10','Entrada','VIP','210','A-1','-','-','-','Cortesía abono','123','9','-','-','D','Principal',event,'-'],
    ['21/10/26 20:11','Entrada','VIP','210','A-2','-','-','-','Cortesía abono','124','8','-','-','D','Principal',event,'-'],
    ['21/10/26 20:12','Entrada','VIP','210','A-3','-','-','-','Abono','125','7','-','PATROCINADOR ACTIVO','D','Principal',event,'1'],
    ['21/10/26 20:13','Entrada','VIP','210','A-4','-','-','-','Abono','126','6','PATROCINIO','-','D','Principal','Abono Compromisos LMP 2026-27','1']
  ]),{
    kind:'access',
    knownPrograms:[{ id:'program-1',order_number:'123',zone:'VIP',section:'210',seat:'A-1',segment:'VIP' }]
  });
  assert.equal(result.included.length,1);
  assert.equal(result.included[0].programId,'program-1');
  assert.equal(result.review.length,1);
  assert.match(result.review[0].reason,/no localizada/i);
  assert.equal(result.excluded.length,2);
  assert.ok(result.excluded.some((row)=>/patrocinador/i.test(row.reason)));
  assert.ok(result.excluded.some((row)=>/evento|producto/i.test(row.reason)));
});

test('la cortesía giveaway autorizada entra solo por coincidencia exacta y condiciones cerradas',async()=>{
  const event='Abono Compromisos LMP 2026-27';
  const row=['21/10/26 20:10','Entrada','Planta Alta Central','SYNTH-S1','A-1','-','-','-','Cortesía abono','GIVEAWAY-1','9','-','-','D','Principal',event,'-'];
  const result=await inspectWorkbook(await accessWorkbook([row]),{
    kind:'access',
    knownPrograms:[{
      id:'giveaway-program',order_number:'GIVEAWAY-1',zone:'Planta Alta Central',
      section:'SYNTH-S1',seat:'A-1',segment:'GENERAL',
      eligibility_exception:'authorized_giveaway_courtesy'
    }]
  });
  assert.equal(result.included.length,1);
  assert.equal(result.included[0].programId,'giveaway-program');
  assert.equal(result.included[0].matchStrategy,'exact');
  assert.equal(result.excluded.length,0);
  assert.equal(result.review.length,0);
});

test('un compromiso o cortesía estándar no entra sin la excepción autorizada',async()=>{
  const event='Abono Compromisos LMP 2026-27';
  const row=['21/10/26 20:10','Entrada','Planta Alta Central','SYNTH-S1','A-1','-','-','-','Cortesía abono','STANDARD-1','9','-','-','D','Principal',event,'-'];
  const result=await inspectWorkbook(await accessWorkbook([row]),{
    kind:'access',
    knownPrograms:[{
      id:'standard-program',order_number:'STANDARD-1',zone:'Planta Alta Central',
      section:'SYNTH-S1',seat:'A-1',segment:'GENERAL'
    }]
  });
  assert.equal(result.included.length,0);
  assert.equal(result.excluded.length,1);
  assert.match(result.excluded[0].reason,/evento|producto/i);
});

test('la excepción giveaway no omite el descarte cuando existe patrocinador',async()=>{
  const event='Abono Compromisos LMP 2026-27';
  const row=['21/10/26 20:10','Entrada','Planta Alta Central','SYNTH-S1','A-1','-','-','-','Cortesía abono','GIVEAWAY-2','9','-','PATROCINADOR ACTIVO','D','Principal',event,'-'];
  const result=await inspectWorkbook(await accessWorkbook([row]),{
    kind:'access',
    knownPrograms:[{
      id:'sponsored-program',order_number:'GIVEAWAY-2',zone:'Planta Alta Central',
      section:'SYNTH-S1',seat:'A-1',segment:'GENERAL',
      eligibility_exception:'authorized_giveaway_courtesy'
    }]
  });
  assert.equal(result.included.length,0);
  assert.equal(result.excluded.length,1);
});

test('la excepción giveaway no omite el descarte de suites',async()=>{
  const event='Abono Compromisos LMP 2026-27';
  const row=['21/10/26 20:10','Entrada','Suite sintética','SYNTH-S1','A-1','-','-','-','Cortesía abono','GIVEAWAY-3','9','-','-','D','Principal',event,'-'];
  const result=await inspectWorkbook(await accessWorkbook([row]),{
    kind:'access',
    knownPrograms:[{
      id:'suite-program',order_number:'GIVEAWAY-3',zone:'Suite sintética',
      section:'SYNTH-S1',seat:'A-1',segment:'GENERAL',
      eligibility_exception:'authorized_giveaway_courtesy'
    }]
  });
  assert.equal(result.included.length,0);
  assert.equal(result.excluded.length,1);
});

test('la excepción giveaway no se aplica por alias o conciliación aproximada',async()=>{
  const event='Abono Compromisos LMP 2026-27';
  const row=['21/10/26 20:10','Entrada','Planta Alta Central alterna','SYNTH-S1','A-1','-','-','-','Cortesía abono','GIVEAWAY-4','9','-','-','D','Principal',event,'-'];
  const result=await inspectWorkbook(await accessWorkbook([row]),{
    kind:'access',
    knownPrograms:[{
      id:'alias-program',order_number:'GIVEAWAY-4',zone:'Planta Alta Central',
      section:'SYNTH-S1',seat:'A-1',segment:'GENERAL',
      eligibility_exception:'authorized_giveaway_courtesy'
    }]
  });
  assert.equal(result.included.length,0);
  assert.equal(result.excluded.length,1);
});

test('conciliación jerárquica usa solo coincidencias únicas y de segmento compatible',async()=>{
  const event='Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const rows=[
    ['21/10/26 20:01','Entrada','VIP','110','A-1','-','-','-','Abono','1','1','-','-','D','Principal',event,'1'],
    ['21/10/26 20:02','Entrada','VIP Lateral','111','A-2','-','-','-','Abono','2','2','-','-','D','Principal',event,'1'],
    ['21/10/26 20:03','Entrada','VIP','999','A-3','-','-','-','Abono','3','3','-','-','D','Principal',event,'1'],
    ['21/10/26 20:04','Entrada','VIP','999','A-4','-','-','-','Abono','4','4','-','-','D','Principal',event,'1'],
    ['21/10/26 20:05','Entrada','VIP','999','A-5','-','-','-','Abono','5','5','-','-','D','Principal',event,'1']
  ];
  const knownPrograms=[
    { id:'exact',order_number:'1',zone:'VIP',section:'110',seat:'A-1',segment:'VIP' },
    { id:'zone-alias',order_number:'2',zone:'VIP',section:'111',seat:'A-2',segment:'VIP' },
    { id:'unique-seat',order_number:'3',zone:'VIP',section:'112',seat:'A-3',segment:'VIP' },
    { id:'ambiguous-a',order_number:'4',zone:'VIP',section:'113',seat:'A-4',segment:'VIP' },
    { id:'ambiguous-b',order_number:'4',zone:'VIP',section:'114',seat:'A-4',segment:'VIP' },
    { id:'wrong-segment',order_number:'5',zone:'Planta Alta Central',section:'115',seat:'A-5',segment:'GENERAL' }
  ];
  const result=await inspectWorkbook(await accessWorkbook(rows),{kind:'access',knownPrograms});
  assert.deepEqual(result.included.map((row)=>row.matchStrategy),[
    'exact','order_section_seat_alias','order_seat_unique'
  ]);
  assert.deepEqual(result.matchStrategies,{
    exact:1,historical_alias:0,order_section_seat_alias:1,order_seat_unique:1
  });
  assert.equal(result.review.length,2);
});

test('el alias histórico exacto tiene prioridad y conserva el programa actual',async()=>{
  const event='Charros de Jalisco: Abono Preferente Charros LMP 2026-2027';
  const row=['21/10/26 20:10','Entrada','Butaca Preferente Tercera Base','219','G1','-','-','-','Abono','15551242','9','-','-','D','Principal',event,'1'];
  const result=await inspectWorkbook(await accessWorkbook([row]),{
    kind:'access',
    knownPrograms:[
      { id:'program-exact-old',order_number:'15551242',zone:'Butaca Preferente Tercera Base',section:'219',seat:'G1',segment:'PREFERENTE' }
    ],
    knownAliases:[{
      id:'program-current',segment:'PREFERENTE',historical_order_number:'15551242',
      historical_zone:'Butaca Preferente Tercera Base',historical_section:'219',historical_seat:'G1'
    }]
  });
  assert.equal(result.included[0].programId,'program-current');
  assert.equal(result.included[0].matchStrategy,'historical_alias');
});

test('deduplica por programa y conserva el escaneo más temprano aunque venga después',async()=>{
  const event='Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const base=['Entrada','VIP','210','A-1','-','-','-','Abono','123','9','-','-','D','Principal',event,'1'];
  const result=await inspectWorkbook(await accessWorkbook([
    ['21/10/26 20:15',...base],
    ['21/10/26 20:05',...base]
  ]),{
    kind:'access',
    knownPrograms:[{ id:'program-1',order_number:'123',zone:'VIP',section:'210',seat:'A-1',segment:'VIP' }]
  });
  assert.equal(result.included.length,1);
  assert.equal(result.included[0].scannedAt,'2026-10-21T20:05:00-06:00');
  assert.equal(result.duplicates.length,1);
  assert.equal(result.duplicates[0].keptScannedAt,'2026-10-21T20:05:00-06:00');
});

test('ignora el pie informativo del reporte y no lo manda a excluidos ni revisión',async()=>{
  const event='Charros de Jalisco: Abono VIP Charros LMP 2026-2027';
  const valid=['21/10/26 20:10','Entrada','VIP','210','A-1','-','-','-','Abono','123','9','-','-','D','Principal',event,'1'];
  const result=await inspectWorkbook(await accessWorkbook([
    valid,
    ['FILTROS APLICADOS'],
    ['EVENTO','FECHA EVENTO'],
    ['Inauguración: Jaguares vs Charros','21/10/26']
  ]),{
    kind:'access',
    knownPrograms:[{ id:'program-1',order_number:'123',zone:'VIP',section:'210',seat:'A-1',segment:'VIP' }]
  });
  assert.equal(result.sourceRows,4);
  assert.equal(result.totalRows,1);
  assert.equal(result.ignoredRows,3);
  assert.equal(result.excluded.length,0);
  assert.equal(result.review.length,0);
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

test('clasifica el producto general por localidad y manda aliases desconocidos a revisión',async()=>{
  const event='Charros de Jalisco: Abono Charros LMP 2026-2027';
  const result=await inspectWorkbook(await salesWorkbook([
    ['10','A','GENERAL','g@example.com','1','Abono','-','Lateral Preferente 1ra - 3ra','1','A-1','10',event,'$10,000.00'],
    ['11','B','PREFERENTE','p@example.com','2','Abono','-','Planta Baja Central','1','A-2','11',event,'$10,000.00'],
    ['12','C','VIP','v@example.com','3','Abono','-','VIP Lateral','1','A-3','12',event,'$10,000.00'],
    ['13','D','REVISAR','r@example.com','4','Abono','-','Zona sin mapa','1','A-4','13',event,'$10,000.00']
  ]),{kind:'sales'});
  assert.deepEqual(result.included.map((row)=>row.segment),['GENERAL','PREFERENTE','VIP']);
  assert.equal(result.review.length,1);
  assert.equal(result.review[0].segment,null);
});

test('normaliza fechas de acceso y expone la fecha observada para validar el partido',async()=>{
  assert.deepEqual(parseAccessTimestamp('3/11/26 19:05'),{
    scanDate:'2026-11-03',
    scannedAt:'2026-11-03T19:05:00-06:00'
  });
  assert.deepEqual(parseAccessTimestamp('03/11/2026 19:05:42'),{
    scanDate:'2026-11-03',
    scannedAt:'2026-11-03T19:05:42-06:00'
  });
  assert.equal(parseAccessTimestamp('31/02/26 19:05'),null);

  const row=['03/11/26 19:05:42','Entrada','VIP','210','A-1','TITULAR','-','-','Abono','123','99999999999999999999','-','-','D','Principal','Charros de Jalisco: Abono VIP Charros LMP 2026-2027','1'];
  const key=seatKey('123','VIP','210','A-1');
  const result=await inspectWorkbook(await accessWorkbook([row]),{kind:'access',knownPrograms:new Map([[key,{id:'program-1'}]])});
  assert.deepEqual(result.observedDates,['2026-11-03']);
  assert.equal(result.included[0].scannedAt,'2026-11-03T19:05:42-06:00');
});
