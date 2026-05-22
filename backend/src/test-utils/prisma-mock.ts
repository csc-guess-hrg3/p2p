/**
 * Mock leve do PrismaService para testes unitários.
 *
 * Em vez de simular um banco inteiro (prismock é complexo com Prisma 7 +
 * mssql), aqui criamos um objeto com todos os métodos esperados como
 * jest.fn(). Cada spec configura o retorno por chamada.
 *
 * Uso:
 *   const prisma = createPrismaMock();
 *   prisma.requisition.findUnique.mockResolvedValue({ id: 'r1', ... });
 *   const service = new MyService(prisma as unknown as PrismaService);
 */

type Fn = jest.Mock;

interface ModelMock {
  findUnique: Fn;
  findUniqueOrThrow: Fn;
  findFirst: Fn;
  findMany: Fn;
  create: Fn;
  createMany: Fn;
  update: Fn;
  updateMany: Fn;
  upsert: Fn;
  delete: Fn;
  deleteMany: Fn;
  count: Fn;
  aggregate: Fn;
}

function model(): ModelMock {
  return {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn(),
  };
}

export interface PrismaMock {
  approvalStep: ModelMock;
  delegation: ModelMock;
  auditLog: ModelMock;
  requisition: ModelMock;
  requisitionItem: ModelMock;
  requisitionItemRateio: ModelMock;
  purchaseOrder: ModelMock;
  purchaseOrderItem: ModelMock;
  purchaseOrderItemRateio: ModelMock;
  fundRequest: ModelMock;
  fundRequestItem: ModelMock;
  receiving: ModelMock;
  receivingItem: ModelMock;
  user: ModelMock;
  userCompany: ModelMock;
  team: ModelMock;
  teamApprovalLevel: ModelMock;
  teamBranchRateio: ModelMock;
  teamCostCenterRateio: ModelMock;
  notification: ModelMock;
  company: ModelMock;
  companyErpConfig: ModelMock;
  systemSetting: ModelMock;
  attachment: ModelMock;
  integrationLog: ModelMock;
  budgetEntry: ModelMock;
  documentSequence: ModelMock;
  fiscalItemRequest: ModelMock;
  paApprovalNotification: ModelMock;
  paDeliveryChange: ModelMock;
  $transaction: Fn;
  $queryRawUnsafe: Fn;
  $queryRaw: Fn;
  $executeRawUnsafe: Fn;
  $executeRaw: Fn;
}

export function createPrismaMock(): PrismaMock {
  const mock: any = {
    approvalStep: model(),
    delegation: model(),
    auditLog: model(),
    requisition: model(),
    requisitionItem: model(),
    requisitionItemRateio: model(),
    purchaseOrder: model(),
    purchaseOrderItem: model(),
    purchaseOrderItemRateio: model(),
    fundRequest: model(),
    fundRequestItem: model(),
    receiving: model(),
    receivingItem: model(),
    user: model(),
    userCompany: model(),
    team: model(),
    teamApprovalLevel: model(),
    teamBranchRateio: model(),
    teamCostCenterRateio: model(),
    notification: model(),
    company: model(),
    companyErpConfig: model(),
    systemSetting: model(),
    attachment: model(),
    integrationLog: model(),
    budgetEntry: model(),
    documentSequence: model(),
    fiscalItemRequest: model(),
    paApprovalNotification: model(),
    paDeliveryChange: model(),
    // $transaction: roda o callback passando o próprio mock como tx, ou
    // resolve uma lista de promises (forma de batch).
    $transaction: jest.fn(async (fnOrList: any) => {
      if (typeof fnOrList === 'function') return fnOrList(mock);
      return Promise.all(fnOrList);
    }),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  return mock as PrismaMock;
}

/** Stub padrão de usuário autenticado para testes. */
export const TEST_USER = {
  id: 'user-test',
  adUsername: 'test.user',
  email: 'test@p2p.local',
  name: 'Test User',
  profile: 'MANAGER',
  status: 'ACTIVE',
  teamId: 'team-test',
  companyIds: ['company-test'],
};
