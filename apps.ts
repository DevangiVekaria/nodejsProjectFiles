import { TransactionHash } from './../transactions/transaction';
import * as express from "express";
import * as compression from "compression";  // compresses requests
import * as bodyParser from "body-parser";
import * as morgan from "morgan";
import * as expressValidator from "express-validator";
import * as errorHandler from "errorhandler";
import { LoggerInstance } from "winston";

import * as privateApiController from "./controllers/private_api";
import * as publicApiController from "./controllers/public_api";
import { StreamOptions } from "morgan";
import WalletHandler from "../wallet/wallet_handler";
import TokenHandler from "../tokens/token_handler";
import PeerHandler from "../peers/peer_handler";
import TransactionHandler from "../transactions/transaction_handler";
import BlockHandler from "../blocks/block_handler";
import MessageBroker from "../message_broker/message_broker";
import { logger } from "handlebars";
import { OrbError } from "../message_broker/errors";
import * as cors from "cors";

/**
 * Implementation of expressjs.com
 */
class App {
  logger: LoggerInstance;
  // TODO - should not really be using any here, but can't get the type to work nicely.
  server: any;
  port: number | undefined;
  options: cors.CorsOptions = {
    allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "X-Access-Token"],
    credentials: true,
    methods: "GET,HEAD,OPTIONS,PUT,PATCH,POST,DELETE",
    origin: "*",
    preflightContinue: false
  };
  constructor(logger: LoggerInstance) {
    this.logger = logger;
    // Create Express server
    this.server = express();
   
    // Express configuration
    this.server.use(compression());
    if (logger) {
      const logStream: StreamOptions = {
        write(message: string) {
          message.split("\n").filter(msg => msg.length > 0).forEach(msg => logger.info(msg));
        }
      };
      this.server.use(morgan("combined", { stream: logStream }));
    }
    this.server.use(bodyParser.json());
    this.server.use(bodyParser.urlencoded({ extended: true }));
    this.server.use(expressValidator());
    //options for cors midddleware


    //use cors middleware
    this.server.use(cors(this.options));

  }
  handleErrors(error: Error, req: express.Request, res: express.Response, next: express.NextFunction) {
    this.logger.error(error.message);
    if (error.stack) {
      this.logger.error(error.stack);
    }
    if (error instanceof OrbError) {
      res.status(error.httpStatusCode);
      res.json({ error: error.message });
    } else {
      res.status(500);
      res.json({ error: error.message });
    }
  }

  start(port: number | string, bind: string) {
    return new Promise((resolve, reject) => {
      this.port = Number(port);
      this.server.set("port", port);
      this.server.listen(port, bind, (error: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Public APIs get and post mappings to controller
 */
export class PublicApp extends App {
  constructor(logger: LoggerInstance, messageBroker: MessageBroker, peerHandler: PeerHandler) {
    super(logger);
    this.server.get("/api/status", publicApiController.getStatus(/* inject dependencies into the function */));
    this.server.get("/api/peers", publicApiController.getPeers(peerHandler));
    this.server.post("/api/peers", publicApiController.becomePeer(peerHandler));
    this.server.post("/api/tokens", publicApiController.newToken(messageBroker));
    this.server.post("/api/transactions", publicApiController.newTransactionPartial(messageBroker));
    this.server.post("/api/transactions/sign", publicApiController.newTransactionFull(messageBroker));
    this.server.post("/api/blocks", publicApiController.blockMined(messageBroker));
    this.server.get("/api/blocks", publicApiController.getBlockHashes(messageBroker));
    this.server.get("/api/blockheight", publicApiController.getBlockHeight(messageBroker));
    this.server.get("/api/blocks/:blockHash", publicApiController.getBlockByHash(messageBroker));
    this.server.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => this.handleErrors(error, req, res, next));
    //enable pre-flight
    this.server.options("*", cors(this.options));
  }
}
/**
 * Private APIs get and post mappings to controller
 */
export class PrivateApp extends App {
  constructor(logger: LoggerInstance, messageBroker: MessageBroker) {
    super(logger);
    this.server.get("/api/stop", privateApiController.stop());
    this.server.get("/api/status", privateApiController.getStatus(/* inject dependencies into the function */));
    this.server.post("/api/wallet", privateApiController.createWallet(messageBroker));
    this.server.get("/api/wallet/balances/:tokenHash", privateApiController.getBalances(messageBroker));
    this.server.get("/api/wallet/balances/:betaPublicKey/:tokenHash", privateApiController.getBilateralBalances(messageBroker));
    this.server.post("/api/tokens", privateApiController.createToken(messageBroker));
    this.server.get("/api/tokens", privateApiController.listTokens(messageBroker));
    this.server.post("/api/transactions", privateApiController.createPartialTransaction(messageBroker));
    this.server.get("/api/transactions", privateApiController.listPartialTransaction(messageBroker));
    this.server.post("/api/transactions/sign", privateApiController.createFullTransaction(messageBroker));
    this.server.get("/api/options", privateApiController.listExercisableOptions(messageBroker));
    this.server.post("/api/options/exercise", privateApiController.exerciseOption(messageBroker));
    this.server.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => this.handleErrors(error, req, res, next));
    //enable pre-flight
    this.server.options("*", cors(this.options));
  }
}
