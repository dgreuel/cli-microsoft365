import { Logger } from '../../../../cli/Logger';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import { validation } from '../../../../utils/validation';
import SpoCommand from '../../../base/SpoCommand';
import commands from '../../commands';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  siteUrl: string;
  enabled: string;
}

class SpoSiteInPlaceRecordsManagementSetCommand extends SpoCommand {
  public get name(): string {
    return commands.SITE_INPLACERECORDSMANAGEMENT_SET;
  }

  public get description(): string {
    return 'Activates or deactivates in-place records management for a site collection';
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
    this.#initValidators();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        enabled: args.options.enabled
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-u, --siteUrl <siteUrl>'
      },
      {
        option: '--enabled <enabled>'
      }
    );
  }

  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        if (!validation.isValidBoolean(args.options.enabled)) {
          return 'Invalid "enabled" option value. Specify "true" or "false"';
        }

        return validation.isValidSharePointUrl(args.options.siteUrl);
      }
    );
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    const enabled: boolean = args.options.enabled.toLocaleLowerCase() === 'true';

    const requestOptions: any = {
      url: `${args.options.siteUrl}/_api/site/features/${enabled ? 'add' : 'remove'}`,
      headers: {
        accept: 'application/json;odata=nometadata'
      },
      data: {
        featureId: 'da2e115b-07e4-49d9-bb2c-35e93bb9fca9',
        force: true
      },
      responseType: 'json'
    };

    if (this.verbose) {
      logger.logToStderr(`${enabled ? 'Activating' : 'Deactivating'} in-place records management for site ${args.options.siteUrl}`);
    }

    try {
      await request.post(requestOptions);
    } 
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }
}

module.exports = new SpoSiteInPlaceRecordsManagementSetCommand();