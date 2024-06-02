import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { NATS_SERVICE } from '../config/services';
import { firstValueFrom } from 'rxjs';
import { ProductType } from '../common';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrderService');

  constructor(
    @Inject(NATS_SERVICE)
    private readonly client: ClientProxy,
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      const ids = createOrderDto.items.map((element) => {
        return element.productId;
      });

      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_product' }, ids),
      );

      console.log('products', products);

      //1. reduce para poder calcular el total de monto
      const totalAmount = createOrderDto.items.reduce((acc: any, orderItem) => {
        const price = products.find(
          (product: ProductType) => product.id === orderItem.productId,
        ).price;
        return acc + price * orderItem.quantity;
      }, 0);

      console.log('totalAmount', totalAmount);

      //2. reduce para calcular el total de items
      const totalItems = createOrderDto.items.reduce((acc: any, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);
      console.log('totalItems', totalItems);

      //3. crear una transaccion de base de datos.
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product: ProductType) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(
            (product: ProductType) => product.id === orderItem.productId,
          ).name,
        })),
      };
    } catch (error) {
      throw new RpcException(error);
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status,
      },
    });
    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    const orders = await this.order.findMany({
      skip: (currentPage - 1) * perPage,
      take: perPage,
      where: {
        status: orderPaginationDto.status,
      },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    const mapData = orders.map(async (order) => {
      const ids = order.OrderItem.map((orderItem) => orderItem.productId);
      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_product' }, ids),
      );
      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(
            (product: ProductType) => product.id === orderItem.productId,
          ).name,
        })),
      };
    });
    const result = await Promise.all(mapData);
    console.log('result', result);

    return {
      data: result,
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: {
        id,
      },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      throw new RpcException({
        message: `Order with id #${id} not found`,
        status: HttpStatus.NOT_FOUND,
      });
    }

    try {
      const ids = order.OrderItem.map((orderItem) => orderItem.productId);

      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_product' }, ids),
      );

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(
            (product: ProductType) => product.id === orderItem.productId,
          ).name,
        })),
      };
    } catch (error) {
      throw new RpcException(error);
    }
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;
    await this.findOne(id);
    console.log('status', status);
    return this.order.update({
      where: { id },
      data: { status },
    });
  }
}
