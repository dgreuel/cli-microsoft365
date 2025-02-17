import { Logger } from '../../../../cli/Logger';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import { validation } from '../../../../utils/validation';
import GraphCommand from '../../../base/GraphCommand';
import commands from '../../commands';

interface CommandArgs {
  options: Options;
}

export interface Options extends GlobalOptions {
  appId?: string;
  displayName?: string;
  objectId?: string;
}

class AadSpGetCommand extends GraphCommand {
  public get name(): string {
    return commands.SP_GET;
  }

  public get description(): string {
    return 'Gets information about the specific service principal';
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
    this.#initValidators();
    this.#initOptionSets();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        appId: (!(!args.options.appId)).toString(),
        displayName: (!(!args.options.displayName)).toString(),
        objectId: (!(!args.options.objectId)).toString()
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-i, --appId [appId]'
      },
      {
        option: '-n, --displayName [displayName]'
      },
      {
        option: '--objectId [objectId]'
      }
    );
  }

  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        if (args.options.appId && !validation.isValidGuid(args.options.appId)) {
          return `${args.options.appId} is not a valid appId GUID`;
        }
    
        if (args.options.objectId && !validation.isValidGuid(args.options.objectId)) {
          return `${args.options.objectId} is not a valid objectId GUID`;
        }
    
        return true;
      }
    );
  }

  #initOptionSets(): void {
    this.optionSets.push(['appId', 'displayName', 'objectId']);
  }

  private getSpId(args: CommandArgs): Promise<string> {
    if (args.options.objectId) {
      return Promise.resolve(args.options.objectId);
    }

    let spMatchQuery: string = '';
    if (args.options.displayName) {
      spMatchQuery = `displayName eq '${encodeURIComponent(args.options.displayName)}'`;
    }
    else if (args.options.appId) {
      spMatchQuery = `appId eq '${encodeURIComponent(args.options.appId)}'`;
    }

    const idRequestOptions: any = {
      url: `${this.resource}/v1.0/servicePrincipals?$filter=${spMatchQuery}`,
      headers: {
        accept: 'application/json;odata.metadata=none'
      },
      responseType: 'json'
    };

    return request
      .get<{ value: { id: string; }[] }>(idRequestOptions)
      .then(response => {
        const spItem: { id: string } | undefined = response.value[0];

        if (!spItem) {
          return Promise.reject(`The specified Azure AD app does not exist`);
        }

        if (response.value.length > 1) {
          return Promise.reject(`Multiple Azure AD apps with name ${args.options.displayName} found: ${response.value.map(x => x.id)}`);
        }

        return Promise.resolve(spItem.id);
      });
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    if (this.verbose) {
      logger.logToStderr(`Retrieving service principal information...`);
    }

    try {
      const id = await this.getSpId(args);

      const requestOptions: any = {
        url: `${this.resource}/v1.0/servicePrincipals/${id}`,
        headers: {
          accept: 'application/json;odata.metadata=none',
          'content-type': 'application/json;odata.metadata=none'
        },
        responseType: 'json'
      };

      const res = await request.get(requestOptions);
      logger.log(res);
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }
}

module.exports = new AadSpGetCommand();