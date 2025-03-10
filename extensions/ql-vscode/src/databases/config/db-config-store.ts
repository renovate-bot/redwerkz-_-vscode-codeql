import { pathExists, outputJSON, readJSON, readJSONSync } from "fs-extra";
import { join } from "path";
import {
  cloneDbConfig,
  DbConfig,
  removeLocalDb,
  removeLocalList,
  removeRemoteList,
  removeRemoteOwner,
  removeRemoteRepo,
  renameLocalDb,
  renameLocalList,
  renameRemoteList,
  SelectedDbItem,
} from "./db-config";
import * as chokidar from "chokidar";
import { DisposableObject, DisposeHandler } from "../../pure/disposable-object";
import { DbConfigValidator } from "./db-config-validator";
import { App } from "../../common/app";
import { AppEvent, AppEventEmitter } from "../../common/events";
import {
  DbConfigValidationError,
  DbConfigValidationErrorKind,
} from "../db-validation-errors";
import { ValueResult } from "../../common/value-result";
import {
  LocalDatabaseDbItem,
  LocalListDbItem,
  RemoteUserDefinedListDbItem,
  DbItem,
  DbItemKind,
} from "../db-item";

export class DbConfigStore extends DisposableObject {
  public readonly onDidChangeConfig: AppEvent<void>;
  private readonly onDidChangeConfigEventEmitter: AppEventEmitter<void>;

  private readonly configPath: string;
  private readonly configValidator: DbConfigValidator;

  private config: DbConfig | undefined;
  private configErrors: DbConfigValidationError[];
  private configWatcher: chokidar.FSWatcher | undefined;

  public constructor(private readonly app: App) {
    super();

    const storagePath = app.workspaceStoragePath || app.globalStoragePath;
    this.configPath = join(storagePath, "workspace-databases.json");

    this.config = this.createEmptyConfig();
    this.configErrors = [];
    this.configWatcher = undefined;
    this.configValidator = new DbConfigValidator(app.extensionPath);
    this.onDidChangeConfigEventEmitter = app.createEventEmitter<void>();
    this.onDidChangeConfig = this.onDidChangeConfigEventEmitter.event;
  }

  public async initialize(): Promise<void> {
    await this.loadConfig();
    this.watchConfig();
  }

  public dispose(disposeHandler?: DisposeHandler): void {
    super.dispose(disposeHandler);
    this.configWatcher?.unwatch(this.configPath);
  }

  public getConfig(): ValueResult<DbConfig, DbConfigValidationError> {
    if (this.config) {
      // Clone the config so that it's not modified outside of this class.
      return ValueResult.ok(cloneDbConfig(this.config));
    } else {
      return ValueResult.fail(this.configErrors);
    }
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public async setSelectedDbItem(dbItem: SelectedDbItem): Promise<void> {
    if (!this.config) {
      // If the app is trying to set the selected item without a config
      // being set it means that there is a bug in our code, so we throw
      // an error instead of just returning an error result.
      throw Error("Cannot select database item if config is not loaded");
    }

    const config = {
      ...this.config,
      selected: dbItem,
    };

    await this.writeConfig(config);
  }

  public async removeDbItem(dbItem: DbItem): Promise<void> {
    if (!this.config) {
      throw Error("Cannot remove item if config is not loaded");
    }

    let config: DbConfig;

    switch (dbItem.kind) {
      case DbItemKind.LocalList:
        config = removeLocalList(this.config, dbItem.listName);
        break;
      case DbItemKind.RemoteUserDefinedList:
        config = removeRemoteList(this.config, dbItem.listName);
        break;
      case DbItemKind.LocalDatabase:
        // When we start using local databases these need to be removed from disk as well.
        config = removeLocalDb(
          this.config,
          dbItem.databaseName,
          dbItem.parentListName,
        );
        break;
      case DbItemKind.RemoteRepo:
        config = removeRemoteRepo(
          this.config,
          dbItem.repoFullName,
          dbItem.parentListName,
        );
        break;
      case DbItemKind.RemoteOwner:
        config = removeRemoteOwner(this.config, dbItem.ownerName);
        break;
      default:
        throw Error(`Type '${dbItem.kind}' cannot be removed`);
    }

    await this.writeConfig(config);
  }

  public async addRemoteRepo(
    repoNwo: string,
    parentList?: string,
  ): Promise<void> {
    if (!this.config) {
      throw Error("Cannot add remote repo if config is not loaded");
    }

    if (repoNwo === "") {
      throw Error("Repository name cannot be empty");
    }

    if (this.doesRemoteDbExist(repoNwo)) {
      throw Error(
        `A remote repository with the name '${repoNwo}' already exists`,
      );
    }

    const config = cloneDbConfig(this.config);
    if (parentList) {
      const parent = config.databases.remote.repositoryLists.find(
        (list) => list.name === parentList,
      );
      if (!parent) {
        throw Error(`Cannot find parent list '${parentList}'`);
      } else {
        parent.repositories.push(repoNwo);
      }
    } else {
      config.databases.remote.repositories.push(repoNwo);
    }
    await this.writeConfig(config);
  }

  public async addRemoteOwner(owner: string): Promise<void> {
    if (!this.config) {
      throw Error("Cannot add remote owner if config is not loaded");
    }

    if (owner === "") {
      throw Error("Owner name cannot be empty");
    }

    if (this.doesRemoteOwnerExist(owner)) {
      throw Error(`A remote owner with the name '${owner}' already exists`);
    }

    const config = cloneDbConfig(this.config);
    config.databases.remote.owners.push(owner);

    await this.writeConfig(config);
  }

  public async addLocalList(listName: string): Promise<void> {
    if (!this.config) {
      throw Error("Cannot add local list if config is not loaded");
    }

    this.validateLocalListName(listName);

    const config = cloneDbConfig(this.config);
    config.databases.local.lists.push({
      name: listName,
      databases: [],
    });

    await this.writeConfig(config);
  }

  public async addRemoteList(listName: string): Promise<void> {
    if (!this.config) {
      throw Error("Cannot add remote list if config is not loaded");
    }

    this.validateRemoteListName(listName);

    const config = cloneDbConfig(this.config);
    config.databases.remote.repositoryLists.push({
      name: listName,
      repositories: [],
    });

    await this.writeConfig(config);
  }

  public async renameLocalList(
    currentDbItem: LocalListDbItem,
    newName: string,
  ) {
    if (!this.config) {
      throw Error("Cannot rename local list if config is not loaded");
    }

    this.validateLocalListName(newName);

    const updatedConfig = renameLocalList(
      this.config,
      currentDbItem.listName,
      newName,
    );

    await this.writeConfig(updatedConfig);
  }

  public async renameRemoteList(
    currentDbItem: RemoteUserDefinedListDbItem,
    newName: string,
  ) {
    if (!this.config) {
      throw Error("Cannot rename remote list if config is not loaded");
    }

    this.validateRemoteListName(newName);

    const updatedConfig = renameRemoteList(
      this.config,
      currentDbItem.listName,
      newName,
    );

    await this.writeConfig(updatedConfig);
  }

  public async renameLocalDb(
    currentDbItem: LocalDatabaseDbItem,
    newName: string,
    parentListName?: string,
  ): Promise<void> {
    if (!this.config) {
      throw Error("Cannot rename local db if config is not loaded");
    }

    this.validateLocalDbName(newName);

    const updatedConfig = renameLocalDb(
      this.config,
      currentDbItem.databaseName,
      newName,
      parentListName,
    );

    await this.writeConfig(updatedConfig);
  }

  public doesRemoteListExist(listName: string): boolean {
    if (!this.config) {
      throw Error("Cannot check remote list existence if config is not loaded");
    }

    return this.config.databases.remote.repositoryLists.some(
      (l) => l.name === listName,
    );
  }

  public doesLocalListExist(listName: string): boolean {
    if (!this.config) {
      throw Error("Cannot check local list existence if config is not loaded");
    }

    return this.config.databases.local.lists.some((l) => l.name === listName);
  }

  public doesLocalDbExist(dbName: string, listName?: string): boolean {
    if (!this.config) {
      throw Error(
        "Cannot check remote database existence if config is not loaded",
      );
    }

    if (listName) {
      return this.config.databases.local.lists.some(
        (l) =>
          l.name === listName && l.databases.some((d) => d.name === dbName),
      );
    }

    return this.config.databases.local.databases.some((d) => d.name === dbName);
  }

  public doesRemoteDbExist(dbName: string, listName?: string): boolean {
    if (!this.config) {
      throw Error(
        "Cannot check remote database existence if config is not loaded",
      );
    }

    if (listName) {
      return this.config.databases.remote.repositoryLists.some(
        (l) => l.name === listName && l.repositories.includes(dbName),
      );
    }

    return this.config.databases.remote.repositories.includes(dbName);
  }

  public doesRemoteOwnerExist(owner: string): boolean {
    if (!this.config) {
      throw Error(
        "Cannot check remote owner existence if config is not loaded",
      );
    }

    return this.config.databases.remote.owners.includes(owner);
  }

  private async writeConfig(config: DbConfig): Promise<void> {
    await outputJSON(this.configPath, config, {
      spaces: 2,
    });
  }

  private async loadConfig(): Promise<void> {
    if (!(await pathExists(this.configPath))) {
      void this.app.logger.log(
        `Creating new database config file at ${this.configPath}`,
      );
      await this.writeConfig(this.createEmptyConfig());
    }

    await this.readConfig();
    void this.app.logger.log(`Database config loaded from ${this.configPath}`);
  }

  private async readConfig(): Promise<void> {
    let newConfig: DbConfig | undefined = undefined;
    try {
      newConfig = await readJSON(this.configPath);
    } catch (e) {
      this.configErrors = [
        {
          kind: DbConfigValidationErrorKind.InvalidJson,
          message: `Failed to read config file: ${this.configPath}`,
        },
      ];
    }

    if (newConfig) {
      this.configErrors = this.configValidator.validate(newConfig);
    }

    if (this.configErrors.length === 0) {
      this.config = newConfig;
      await this.app.executeCommand(
        "setContext",
        "codeQLDatabasesExperimental.configError",
        false,
      );
    } else {
      this.config = undefined;
      await this.app.executeCommand(
        "setContext",
        "codeQLDatabasesExperimental.configError",
        true,
      );
    }
  }

  private readConfigSync(): void {
    let newConfig: DbConfig | undefined = undefined;
    try {
      newConfig = readJSONSync(this.configPath);
    } catch (e) {
      this.configErrors = [
        {
          kind: DbConfigValidationErrorKind.InvalidJson,
          message: `Failed to read config file: ${this.configPath}`,
        },
      ];
    }

    if (newConfig) {
      this.configErrors = this.configValidator.validate(newConfig);
    }

    if (this.configErrors.length === 0) {
      this.config = newConfig;
      void this.app.executeCommand(
        "setContext",
        "codeQLDatabasesExperimental.configError",
        false,
      );
    } else {
      this.config = undefined;
      void this.app.executeCommand(
        "setContext",
        "codeQLDatabasesExperimental.configError",
        true,
      );
    }
    this.onDidChangeConfigEventEmitter.fire();
  }

  private watchConfig(): void {
    this.configWatcher = chokidar
      .watch(this.configPath, {
        // In some cases, change events are emitted while the file is still
        // being written. The awaitWriteFinish option tells the watcher to
        // poll the file size, holding its add and change events until the size
        // does not change for a configurable amount of time. We set that time
        // to 1 second, but it may need to be adjusted if there are issues.
        awaitWriteFinish: {
          stabilityThreshold: 1000,
        },
      })
      .on("change", () => {
        this.readConfigSync();
      });
  }

  private createEmptyConfig(): DbConfig {
    return {
      databases: {
        remote: {
          repositoryLists: [],
          owners: [],
          repositories: [],
        },
        local: {
          lists: [],
          databases: [],
        },
      },
    };
  }

  private validateLocalListName(listName: string): void {
    if (listName === "") {
      throw Error("List name cannot be empty");
    }

    if (this.doesLocalListExist(listName)) {
      throw Error(`A local list with the name '${listName}' already exists`);
    }
  }

  private validateRemoteListName(listName: string): void {
    if (listName === "") {
      throw Error("List name cannot be empty");
    }

    if (this.doesRemoteListExist(listName)) {
      throw Error(`A remote list with the name '${listName}' already exists`);
    }
  }

  private validateLocalDbName(dbName: string): void {
    if (dbName === "") {
      throw Error("Database name cannot be empty");
    }

    if (this.doesLocalDbExist(dbName)) {
      throw Error(`A local database with the name '${dbName}' already exists`);
    }
  }
}
