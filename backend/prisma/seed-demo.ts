/**
 * Dados de DEMONSTRAÇÃO do agente de diagnóstico (foco em celulares).
 *
 * Cria um histórico realista na empresa "Inforcell" do seed: atendimentos já entregues com
 * diagnóstico concluído, medições, reparos com preço e artigos na base de conhecimento. Assim o
 * agente encontra casos semelhantes e preços para mostrar na apresentação. Também abre duas OS
 * novas, prontas para iniciar o diagnóstico ao vivo.
 *
 * Executar DEPOIS do seed normal:  npm run db:seed && npm run db:seed:demo
 * Pode rodar de novo sem duplicar (confere se a demonstração já existe).
 * Não use em produção com clientes reais: os dados são fictícios.
 */
import { PrismaClient, AvaliacaoMedicao, TipoEquipamento } from "@prisma/client";

const prisma = new PrismaClient();
const MARCADOR = "(demonstração)";

interface CasoHistorico {
  cliente: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  defeito: string;
  sintoma: string;
  diagnostico: string;
  medicoes: { ponto: string; grandeza: string; valor: number; unidade: string; esperado: string; avaliacao: AvaliacaoMedicao }[];
  reparo: { descricao: string; pecas: string; valor: number };
  diasAtras: number;
}

const CASOS: CasoHistorico[] = [
  {
    cliente: "Ana Lima",
    tipo: "CELULAR",
    marca: "Apple",
    modelo: "iPhone 11",
    defeito: "Não liga de repente",
    sintoma: "Não liga, sem vibração, tela preta",
    diagnostico: "Flex do botão Power rompido (sem comando de partida). Placa ligou ao acionar o pad de Power com pinça.",
    medicoes: [
      { ponto: "Conector da bateria", grandeza: "tensão", valor: 4.0, unidade: "V", esperado: "3,8–4,2 V", avaliacao: "DENTRO_DO_ESPERADO" },
      { ponto: "Consumo na fonte ao pressionar Power", grandeza: "corrente", valor: 0, unidade: "mA", esperado: "50–300 mA", avaliacao: "ABAIXO_DO_ESPERADO" },
    ],
    reparo: { descricao: "Troca do flex do botão Power", pecas: "Flex Power/volume iPhone 11", valor: 180 },
    diasAtras: 60,
  },
  {
    cliente: "Bruno Costa",
    tipo: "CELULAR",
    marca: "Apple",
    modelo: "iPhone 11",
    defeito: "Não liga depois de uma queda",
    sintoma: "Não liga e não dá sinal de carga",
    diagnostico: "Flex do botão Power rompido na dobra após queda. Consumo zero ao pressionar Power; ligou com flex novo.",
    medicoes: [
      { ponto: "Consumo na fonte ao pressionar Power", grandeza: "corrente", valor: 0, unidade: "mA", esperado: "50–300 mA", avaliacao: "ABAIXO_DO_ESPERADO" },
    ],
    reparo: { descricao: "Troca do flex do botão Power", pecas: "Flex Power/volume iPhone 11", valor: 170 },
    diasAtras: 35,
  },
  {
    cliente: "Carla Mendes",
    tipo: "CELULAR",
    marca: "Apple",
    modelo: "iPhone 11",
    defeito: "Reinicia sozinho a cada 3 minutos",
    sintoma: "Reinicia em ciclo de cerca de 3 minutos (panic)",
    diagnostico: "Panic por sensor ausente: flex do conector de carga (microfone/sensor) com defeito. Log de panic indicava falta de sensor.",
    medicoes: [],
    reparo: { descricao: "Troca do flex do conector de carga", pecas: "Flex conector de carga iPhone 11", valor: 160 },
    diasAtras: 20,
  },
  {
    cliente: "Diego Rocha",
    tipo: "CELULAR",
    marca: "Apple",
    modelo: "iPhone 11",
    defeito: "Não carrega",
    sintoma: "Não carrega, às vezes carrega mexendo no cabo",
    diagnostico: "Conector de carga com oxidação e sujeira. Limpeza não resolveu; troca do flex de carga.",
    medicoes: [
      { ponto: "Amperímetro USB no conector", grandeza: "corrente", valor: 0.05, unidade: "A", esperado: "0,8–2,0 A", avaliacao: "ABAIXO_DO_ESPERADO" },
    ],
    reparo: { descricao: "Limpeza e troca do flex de carga", pecas: "Flex conector de carga iPhone 11", valor: 150 },
    diasAtras: 12,
  },
  {
    cliente: "Elisa Moura",
    tipo: "CELULAR",
    marca: "Samsung",
    modelo: "Galaxy A12",
    defeito: "Não carrega",
    sintoma: "Não carrega, não reconhece o cabo",
    diagnostico: "Conector USB-C da subplaca danificado. Placa principal OK com carga pela subplaca nova.",
    medicoes: [
      { ponto: "Amperímetro USB no conector", grandeza: "corrente", valor: 0, unidade: "A", esperado: "0,5–1,5 A", avaliacao: "ABAIXO_DO_ESPERADO" },
    ],
    reparo: { descricao: "Troca da subplaca de carga", pecas: "Subplaca USB-C Galaxy A12", valor: 120 },
    diasAtras: 40,
  },
  {
    cliente: "Fábio Nunes",
    tipo: "CELULAR",
    marca: "Samsung",
    modelo: "Galaxy A12",
    defeito: "Molhou e não liga",
    sintoma: "Não liga após contato com água",
    diagnostico: "Oxidação na região do PMIC com curto em VPH_PWR. Limpeza em ultrassom e troca de capacitor em curto resolveram.",
    medicoes: [
      { ponto: "Consumo na fonte ao conectar", grandeza: "corrente", valor: 1.2, unidade: "A", esperado: "0 mA (desligado)", avaliacao: "ACIMA_DO_ESPERADO" },
    ],
    reparo: { descricao: "Banho químico em ultrassom e troca de capacitor em curto na linha VPH_PWR", pecas: "Capacitor SMD 0402", valor: 200 },
    diasAtras: 25,
  },
  {
    cliente: "Gabriela Prado",
    tipo: "CELULAR",
    marca: "Motorola",
    modelo: "Moto G22",
    defeito: "Tela trincada sem imagem",
    sintoma: "Sem imagem, touch não responde",
    diagnostico: "Display (frontal) danificado por queda. Placa OK com tela de teste.",
    medicoes: [],
    reparo: { descricao: "Troca do frontal (display + touch)", pecas: "Frontal Moto G22", valor: 230 },
    diasAtras: 8,
  },
];

const ARTIGOS = [
  {
    titulo: "iPhone 11 não liga — consumo zero ao pressionar Power",
    tipoEquipamento: "CELULAR" as const,
    marca: "Apple",
    modelo: "iPhone 11",
    sintoma: "não liga, sem vibração, consumo zero",
    conteudo:
      "Na fonte de bancada (4,0 V no conector da bateria), consumo zero ao pressionar Power aponta para o comando de partida. " +
      "1) Testar acionando o pad do Power com pinça ou com flex de teste. 2) Se ligar, trocar o flex Power/volume (defeito mais comum após queda). " +
      "3) Se não ligar, medir PP_VDD_MAIN em modo diodo e comparar com placa boa antes de suspeitar do PMIC.",
    tags: "iphone 11, nao liga, flex power, consumo zero",
  },
  {
    titulo: "iPhone reiniciando a cada 3 minutos (panic de sensor)",
    tipoEquipamento: "CELULAR" as const,
    marca: "Apple",
    modelo: "iPhone 11",
    sintoma: "reinicia sozinho, ciclo de 3 minutos, panic",
    conteudo:
      "Reinício em ciclo de ~3 minutos indica falta de leitura de sensor (watchdog). Ler o panic-full em Ajustes > Privacidade > Análise. " +
      "No iPhone 11, a causa mais comum é o flex do conector de carga (microfone/sensores). Testar com flex de carga conhecido antes de mexer na placa.",
    tags: "iphone, reinicia, panic, sensor, flex de carga",
  },
  {
    titulo: "Celular molhado — procedimento de oxidação",
    tipoEquipamento: "CELULAR" as const,
    marca: null,
    modelo: null,
    sintoma: "molhou, oxidação, não liga, curto",
    conteudo:
      "Não carregar o aparelho. Desconectar a bateria imediatamente. Inspecionar com microscópio, limpar em ultrassom com solução própria e enxaguar com álcool isopropílico 99%. " +
      "Secar bem antes de testar na fonte. Se houver consumo alto ao conectar, procurar curto na linha principal (VDD_MAIN / VPH_PWR) com injeção de tensão e câmera térmica.",
    tags: "oxidacao, agua, ultrassom, isopropilico, curto",
  },
  {
    titulo: "Samsung linha A não carrega — subplaca de carga",
    tipoEquipamento: "CELULAR" as const,
    marca: "Samsung",
    modelo: "Galaxy A12",
    sintoma: "não carrega, não reconhece cabo",
    conteudo:
      "Na linha Galaxy A, o conector USB-C fica numa subplaca ligada por flex. Testar com amperímetro USB: 0 A sem reconhecer o cabo aponta para a subplaca ou o flex de interligação. " +
      "Trocar a subplaca resolve na maioria dos casos. Se persistir, verificar o IC de carga na placa principal.",
    tags: "samsung, galaxy a12, carga, subplaca, usb-c",
  },
];

async function main() {
  const empresa = await prisma.empresa.findFirst({ where: { nome: "Inforcell" }, orderBy: { id: "asc" } });
  const tecnico = await prisma.usuario.findUnique({ where: { email: "tecnico@inforcell.local" } });
  const atendente = await prisma.usuario.findUnique({ where: { email: "atendente@inforcell.local" } });
  if (!empresa || !tecnico || !atendente) {
    throw new Error("Rode primeiro o seed normal: npm run db:seed");
  }
  const empresaId = empresa.id;

  if (await prisma.cliente.findFirst({ where: { empresaId, nome: { contains: MARCADOR } } })) {
    console.log("A demonstração já existe nesta empresa. Nada foi alterado.");
    return;
  }

  let numero = (await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).ultimoNumeroOS;
  const dia = 24 * 60 * 60 * 1000;

  for (const c of CASOS) {
    const quando = new Date(Date.now() - c.diasAtras * dia);
    const cliente = await prisma.cliente.create({
      data: { empresaId, nome: `${c.cliente} ${MARCADOR}`, telefone: `9990000${String(numero + 100).padStart(4, "0")}` },
    });
    const equipamento = await prisma.equipamento.create({
      data: { empresaId, clienteId: cliente.id, tipo: c.tipo, marca: c.marca, modelo: c.modelo },
    });
    numero++;
    const os = await prisma.ordemServico.create({
      data: {
        empresaId,
        numero,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        atendenteId: atendente.id,
        tecnicoId: tecnico.id,
        defeitoRelatado: c.defeito,
        status: "ENTREGUE",
        valorOrcamento: c.reparo.valor,
        finalizadaEm: new Date(quando.getTime() + dia),
        entregueEm: new Date(quando.getTime() + 2 * dia),
        createdAt: quando,
        historico: {
          create: [
            { usuarioId: atendente.id, para: "RECEBIDO", observacao: "Abertura da OS", createdAt: quando },
            { usuarioId: atendente.id, de: "FINALIZADO", para: "ENTREGUE", observacao: "Entregue ao cliente", createdAt: new Date(quando.getTime() + 2 * dia) },
          ],
        },
      },
    });
    const sessao = await prisma.sessaoDiagnostico.create({
      data: {
        osId: os.id,
        tecnicoId: tecnico.id,
        sintoma: c.sintoma,
        status: "CONCLUIDA",
        diagnosticoFinal: c.diagnostico,
        createdAt: quando,
        concluidaEm: new Date(quando.getTime() + 3 * 60 * 60 * 1000),
        mensagens: {
          create: [
            { autor: "TECNICO", conteudo: `Diagnóstico registrado na demonstração: ${c.sintoma}`, createdAt: quando },
          ],
        },
      },
    });
    for (const m of c.medicoes) {
      await prisma.medicao.create({
        data: {
          osId: os.id,
          sessaoId: sessao.id,
          pontoMedicao: m.ponto,
          grandeza: m.grandeza,
          valor: m.valor,
          unidade: m.unidade,
          resultadoEsperado: m.esperado,
          avaliacao: m.avaliacao,
          createdAt: quando,
        },
      });
    }
    await prisma.reparo.create({
      data: {
        osId: os.id,
        tecnicoId: tecnico.id,
        descricao: c.reparo.descricao,
        pecasUtilizadas: c.reparo.pecas,
        valorFinal: c.reparo.valor,
        createdAt: new Date(quando.getTime() + dia),
      },
    });
  }

  await prisma.artigoConhecimento.createMany({ data: ARTIGOS.map((a) => ({ ...a, empresaId })) });

  // Duas OS novas, prontas para o diagnóstico ao vivo na apresentação.
  const abertas = [
    { cliente: "Helena Dias", marca: "Apple", modelo: "iPhone 11", defeito: "Não liga depois que caiu no chão." },
    { cliente: "Igor Santos", marca: "Samsung", modelo: "Galaxy A12", defeito: "Parou de carregar, não reconhece o carregador." },
  ];
  for (const a of abertas) {
    const cliente = await prisma.cliente.create({
      data: { empresaId, nome: `${a.cliente} ${MARCADOR}`, telefone: `9990000${String(numero + 100).padStart(4, "0")}` },
    });
    const equipamento = await prisma.equipamento.create({
      data: { empresaId, clienteId: cliente.id, tipo: "CELULAR", marca: a.marca, modelo: a.modelo },
    });
    numero++;
    await prisma.ordemServico.create({
      data: {
        empresaId,
        numero,
        clienteId: cliente.id,
        equipamentoId: equipamento.id,
        atendenteId: atendente.id,
        tecnicoId: tecnico.id,
        defeitoRelatado: a.defeito,
        historico: { create: { usuarioId: atendente.id, para: "RECEBIDO", observacao: "Abertura da OS (demonstração)" } },
      },
    });
  }

  await prisma.empresa.update({ where: { id: empresaId }, data: { ultimoNumeroOS: numero } });
  console.log(`Demonstração criada: ${CASOS.length} atendimentos concluídos, ${ARTIGOS.length} artigos e 2 OS abertas para diagnóstico.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
