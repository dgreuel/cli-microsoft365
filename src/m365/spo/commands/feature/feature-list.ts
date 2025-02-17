import { Logger } from '../../../../cli/Logger';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import { validation } from '../../../../utils/validation';
import SpoCommand from '../../../base/SpoCommand';
import commands from '../../commands';
import { Feature } from './Feature';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  url: string;
  scope?: string;
}

class SpoFeatureListCommand extends SpoCommand {
  public get name(): string {
    return commands.FEATURE_LIST;
  }

  public get description(): string {
    return 'Lists Features activated in the specified site or site collection';
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
        scope: args.options.scope || 'Web'
      });
    });
  }
  
  #initOptions(): void {
    this.options.unshift(
      {
        option: '-u, --url <url>'
      },
      {
        option: '-s, --scope [scope]',
        autocomplete: ['Site', 'Web']
      }
    );
  }
  
  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        if (args.options.scope) {
          if (args.options.scope !== 'Site' &&
            args.options.scope !== 'Web') {
            return `${args.options.scope} is not a valid Feature scope. Allowed values are Site|Web`;
          }
        }
    
        return validation.isValidSharePointUrl(args.options.url);
      }
    );
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    const scope: string = (args.options.scope) ? args.options.scope : 'Web';
    const requestOptions: any = {
      url: `${args.options.url}/_api/${scope}/Features?$select=DisplayName,DefinitionId`,
      headers: {
        accept: 'application/json;odata=nometadata'
      },
      responseType: 'json'
    };

    try {
      const features = await request.get<{ value: Feature[] }>(requestOptions);
      if (features.value && features.value.length > 0) {
        logger.log(features.value);
      }
      else {
        if (this.verbose) {
          logger.logToStderr('No activated Features found');
        }
      }
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }
}

module.exports = new SpoFeatureListCommand();