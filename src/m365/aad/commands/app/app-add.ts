import * as fs from 'fs';
import { v4 } from 'uuid';
import auth from '../../../../Auth';
import { Logger } from '../../../../cli/Logger';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import { accessToken } from '../../../../utils/accessToken';
import { odata } from '../../../../utils/odata';
import GraphCommand from '../../../base/GraphCommand';
import { M365RcJson } from '../../../base/M365RcJson';
import commands from '../../commands';

interface ServicePrincipalInfo {
  appId: string;
  appRoles: { id: string; value: string; }[];
  id: string;
  oauth2PermissionScopes: { id: string; value: string; }[];
  servicePrincipalNames: string[];
}

interface RequiredResourceAccess {
  resourceAppId: string;
  resourceAccess: ResourceAccess[];
}

interface ResourceAccess {
  id: string;
  type: string;
}

interface AppInfo {
  appId: string;
  // objectId
  id: string;
  tenantId: string;
  secret?: string;
  // used when multiple secrets have been defined in the manifest
  // in v6 we'll remove secret from AppInfo and just use secrets
  secrets?: {
    displayName: string;
    value: string;
  }[];
  requiredResourceAccess: RequiredResourceAccess[];
}

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  apisApplication?: string;
  apisDelegated?: string;
  grantAdminConsent?: boolean;
  implicitFlow: boolean;
  manifest?: string;
  multitenant: boolean;
  name?: string;
  platform?: string;
  redirectUris?: string;
  save?: boolean;
  scopeAdminConsentDescription?: string;
  scopeAdminConsentDisplayName?: string;
  scopeConsentBy?: string;
  scopeName?: string;
  uri?: string;
  withSecret: boolean;
  certificateFile?: string;
  certificateBase64Encoded?: string;
  certificateDisplayName?: string;
}

interface AppPermissions {
  resourceId: string;
  resourceAccess: ResourceAccess[];
  scope: string[];
}

class AadAppAddCommand extends GraphCommand {
  private static aadApplicationPlatform: string[] = ['spa', 'web', 'publicClient'];
  private static aadAppScopeConsentBy: string[] = ['admins', 'adminsAndUsers'];
  private manifest: any;
  private appName: string = '';
  private appPermissions: AppPermissions[] = [];

  public get name(): string {
    return commands.APP_ADD;
  }

  public get description(): string {
    return 'Creates new Azure AD app registration';
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
        apis: typeof args.options.apisDelegated !== 'undefined',
        implicitFlow: args.options.implicitFlow,
        multitenant: args.options.multitenant,
        platform: args.options.platform,
        redirectUris: typeof args.options.redirectUris !== 'undefined',
        scopeAdminConsentDescription: typeof args.options.scopeAdminConsentDescription !== 'undefined',
        scopeAdminConsentDisplayName: typeof args.options.scopeAdminConsentDisplayName !== 'undefined',
        scopeConsentBy: args.options.scopeConsentBy,
        scopeName: typeof args.options.scopeName !== 'undefined',
        uri: typeof args.options.uri !== 'undefined',
        withSecret: args.options.withSecret,
        certificateFile: typeof args.options.certificateFile !== 'undefined',
        certificateBase64Encoded: typeof args.options.certificateBase64Encoded !== 'undefined',
        certificateDisplayName: typeof args.options.certificateDisplayName !== 'undefined',
        grantAdminConsent: typeof args.options.grantAdminConsent !== 'undefined'
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-n, --name [name]'
      },
      {
        option: '--multitenant'
      },
      {
        option: '-r, --redirectUris [redirectUris]'
      },
      {
        option: '-p, --platform [platform]',
        autocomplete: AadAppAddCommand.aadApplicationPlatform
      },
      {
        option: '--implicitFlow'
      },
      {
        option: '-s, --withSecret'
      },
      {
        option: '--apisDelegated [apisDelegated]'
      },
      {
        option: '--apisApplication [apisApplication]'
      },
      {
        option: '-u, --uri [uri]'
      },
      {
        option: '--scopeName [scopeName]'
      },
      {
        option: '--scopeConsentBy [scopeConsentBy]',
        autocomplete: AadAppAddCommand.aadAppScopeConsentBy
      },
      {
        option: '--scopeAdminConsentDisplayName [scopeAdminConsentDisplayName]'
      },
      {
        option: '--scopeAdminConsentDescription [scopeAdminConsentDescription]'
      },
      {
        option: '--certificateFile [certificateFile]'
      },
      {
        option: '--certificateBase64Encoded [certificateBase64Encoded]'
      },
      {
        option: '--certificateDisplayName [certificateDisplayName]'
      },
      {
        option: '--manifest [manifest]'
      },
      {
        option: '--save'
      },
      {
        option: '--grantAdminConsent'
      }
    );
  }

  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        if (!args.options.manifest && !args.options.name) {
          return 'Specify either the name of the app to create or the manifest';
        }

        if (args.options.platform &&
          AadAppAddCommand.aadApplicationPlatform.indexOf(args.options.platform) < 0) {
          return `${args.options.platform} is not a valid value for platform. Allowed values are ${AadAppAddCommand.aadApplicationPlatform.join(', ')}`;
        }

        if (args.options.redirectUris && !args.options.platform) {
          return `When you specify redirectUris you also need to specify platform`;
        }

        if (args.options.certificateFile && args.options.certificateBase64Encoded) {
          return 'Specify either certificateFile or certificateBase64Encoded but not both';
        }

        if (args.options.certificateDisplayName && !args.options.certificateFile && !args.options.certificateBase64Encoded) {
          return 'When you specify certificateDisplayName you also need to specify certificateFile or certificateBase64Encoded';
        }

        if (args.options.certificateFile && !fs.existsSync(args.options.certificateFile as string)) {
          return 'Certificate file not found';
        }

        if (args.options.scopeName) {
          if (!args.options.uri) {
            return `When you specify scopeName you also need to specify uri`;
          }

          if (!args.options.scopeAdminConsentDescription) {
            return `When you specify scopeName you also need to specify scopeAdminConsentDescription`;
          }

          if (!args.options.scopeAdminConsentDisplayName) {
            return `When you specify scopeName you also need to specify scopeAdminConsentDisplayName`;
          }
        }

        if (args.options.scopeConsentBy &&
          AadAppAddCommand.aadAppScopeConsentBy.indexOf(args.options.scopeConsentBy) < 0) {
          return `${args.options.scopeConsentBy} is not a valid value for scopeConsentBy. Allowed values are ${AadAppAddCommand.aadAppScopeConsentBy.join(', ')}`;
        }

        if (args.options.manifest) {
          try {
            this.manifest = JSON.parse(args.options.manifest);
            if (!args.options.name && !this.manifest.name) {
              return `Specify the name of the app to create either through the 'name' option or the 'name' property in the manifest`;
            }
          }
          catch (e) {
            return `Error while parsing the specified manifest: ${e}`;
          }
        }

        return true;
      },
    );
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    try {
      const apis = await this.resolveApis(args, logger);
      let appInfo: any = await this.createAppRegistration(args, apis, logger);
      // based on the assumption that we're adding AAD app to the current
      // directory. If we in the future extend the command with allowing
      // users to create AAD app in a different directory, we'll need to
      // adjust this
      appInfo.tenantId = accessToken.getTenantIdFromAccessToken(auth.service.accessTokens[auth.defaultResource].accessToken);
      appInfo = await this.updateAppFromManifest(args, appInfo);
      appInfo = await this.grantAdminConsent(appInfo, args.options.grantAdminConsent, logger);
      appInfo = await this.configureUri(args, appInfo, logger);
      appInfo = await this.configureSecret(args, appInfo, logger);
      const _appInfo = await this.saveAppInfo(args, appInfo, logger);

      appInfo = {
        appId: _appInfo.appId,
        objectId: _appInfo.id,
        tenantId: _appInfo.tenantId
      };
      if (_appInfo.secret) {
        appInfo.secret = _appInfo.secret;
      }
      if (_appInfo.secrets) {
        appInfo.secrets = _appInfo.secrets;
      }

      logger.log(appInfo);
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }

  private async createAppRegistration(args: CommandArgs, apis: RequiredResourceAccess[], logger: Logger): Promise<AppInfo> {
    const applicationInfo: any = {
      displayName: args.options.name,
      signInAudience: args.options.multitenant ? 'AzureADMultipleOrgs' : 'AzureADMyOrg'
    };

    if (!applicationInfo.displayName && this.manifest) {
      applicationInfo.displayName = this.manifest.name;
    }
    this.appName = applicationInfo.displayName;

    if (apis.length > 0) {
      applicationInfo.requiredResourceAccess = apis;
    }

    if (args.options.redirectUris) {
      applicationInfo[args.options.platform!] = {
        redirectUris: args.options.redirectUris.split(',').map(u => u.trim())
      };
    }

    if (args.options.implicitFlow) {
      if (!applicationInfo.web) {
        applicationInfo.web = {};
      }
      applicationInfo.web.implicitGrantSettings = {
        enableAccessTokenIssuance: true,
        enableIdTokenIssuance: true
      };
    }

    if (args.options.certificateFile || args.options.certificateBase64Encoded) {
      const certificateBase64Encoded = this.getCertificateBase64Encoded(args, logger);

      const newKeyCredential = {
        type: "AsymmetricX509Cert",
        usage: "Verify",
        displayName: args.options.certificateDisplayName,
        key: certificateBase64Encoded
      } as any;

      applicationInfo.keyCredentials = [newKeyCredential];
    }

    if (this.verbose) {
      logger.logToStderr(`Creating Azure AD app registration...`);
    }

    const createApplicationRequestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/applications`,
      headers: {
        accept: 'application/json;odata.metadata=none'
      },
      responseType: 'json',
      data: applicationInfo
    };

    return request.post<AppInfo>(createApplicationRequestOptions);
  }

  private grantAdminConsent(appInfo: AppInfo, adminConsent: boolean | undefined, logger: Logger): Promise<AppInfo> {
    if (!adminConsent || this.appPermissions.length === 0) {
      return Promise.resolve(appInfo);
    }

    return this.createServicePrincipal(appInfo.appId)
      .then((sp: ServicePrincipalInfo) => {
        if (this.debug) {
          logger.logToStderr("Service principal created, returned object id: " + sp.id);
        }

        const tasks: Promise<void>[] = [];

        this.appPermissions.forEach(permission => {
          if (permission.scope.length > 0) {
            tasks.push(this.grantOAuth2Permission(sp.id, permission.resourceId, permission.scope.join(' ')));

            if (this.debug) {
              logger.logToStderr(`Admin consent granted for following resource ${permission.resourceId}, with delegated permissions: ${permission.scope.join(',')}`);
            }
          }

          permission.resourceAccess.filter(access => access.type === "Role").forEach((access: ResourceAccess) => {
            tasks.push(this.addRoleToServicePrincipal(sp.id, permission.resourceId, access.id));

            if (this.debug) {
              logger.logToStderr(`Admin consent granted for following resource ${permission.resourceId}, with application permission: ${access.id}`);
            }
          });
        });

        return Promise.all(tasks)
          .then(_ => {
            return appInfo;
          });
      });
  }

  private addRoleToServicePrincipal(objectId: string, resourceId: string, appRoleId: string): Promise<void> {
    const requestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/servicePrincipals/${objectId}/appRoleAssignments`,
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'json',
      data: {
        appRoleId: appRoleId,
        principalId: objectId,
        resourceId: resourceId
      }
    };

    return request.post<void>(requestOptions);
  }

  private grantOAuth2Permission(appId: string, resourceId: string, scopeName: string): Promise<void> {
    const grantAdminConsentApplicationRequestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/oauth2PermissionGrants`,
      headers: {
        accept: 'application/json;odata.metadata=none'
      },
      responseType: 'json',
      data: {
        clientId: appId,
        consentType: "AllPrincipals",
        principalId: null,
        resourceId: resourceId,
        scope: scopeName
      }
    };

    return request.post<void>(grantAdminConsentApplicationRequestOptions);
  }

  private createServicePrincipal(appId: string): Promise<ServicePrincipalInfo> {
    const requestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/servicePrincipals`,
      headers: {
        'content-type': 'application/json'
      },
      data: {
        appId: appId
      },
      responseType: 'json'
    };

    return request.post<ServicePrincipalInfo>(requestOptions);
  }

  private updateAppFromManifest(args: CommandArgs, appInfo: AppInfo): Promise<AppInfo> {
    if (!args.options.manifest) {
      return Promise.resolve(appInfo);
    }

    const v2Manifest: any = JSON.parse(args.options.manifest);
    // remove properties that might be coming from the original app that was
    // used to create the manifest and which can't be updated
    delete v2Manifest.id;
    delete v2Manifest.appId;
    delete v2Manifest.publisherDomain;

    // extract secrets from the manifest. Store them in a separate variable
    const secrets: { name: string, expirationDate: Date }[] = this.getSecretsFromManifest(v2Manifest);

    // Azure Portal returns v2 manifest whereas the Graph API expects a v1.6

    if (args.options.apisApplication || args.options.apisDelegated) {
      // take submitted delegated / application permissions as options
      // otherwise, they will be skipped in the app update
      v2Manifest.requiredResourceAccess = appInfo.requiredResourceAccess;
    }

    if (args.options.redirectUris) {
      // take submitted redirectUris/platform as options
      // otherwise, they will be removed from the app
      v2Manifest.replyUrlsWithType = args.options.redirectUris.split(',').map(u => {
        return {
          url: u.trim(),
          type: this.translatePlatformToType(args.options.platform!)
        };
      });
    }

    if (args.options.multitenant) {
      // override manifest setting when using multitenant flag
      v2Manifest.signInAudience = 'AzureADMultipleOrgs';
    }

    if (args.options.implicitFlow) {
      // remove manifest settings when using implicitFlow flag
      delete v2Manifest.oauth2AllowIdTokenImplicitFlow;
      delete v2Manifest.oauth2AllowImplicitFlow;
    }

    if (args.options.scopeName) {
      // override manifest setting when using options.
      delete v2Manifest.oauth2Permissions;
    }

    if (args.options.certificateFile || args.options.certificateBase64Encoded) {
      // override manifest setting when using options.
      delete v2Manifest.keyCredentials;
    }

    const graphManifest = this.transformManifest(v2Manifest);

    const updateAppRequestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/applications/${appInfo.id}`,
      headers: {
        'content-type': 'application/json'
      },
      responseType: 'json',
      data: graphManifest
    };

    return request
      .patch(updateAppRequestOptions)
      .then(_ => this.updatePreAuthorizedAppsFromManifest(v2Manifest, appInfo))
      .then(_ => this.createSecrets(secrets, appInfo));
  }

  private getSecretsFromManifest(manifest: any): { name: string, expirationDate: Date }[] {
    if (!manifest.passwordCredentials || manifest.passwordCredentials.length === 0) {
      return [];
    }

    const secrets = manifest.passwordCredentials.map((c: any) => {
      const startDate = new Date(c.startDate);
      const endDate = new Date(c.endDate);
      const expirationDate = new Date();
      expirationDate.setMilliseconds(endDate.valueOf() - startDate.valueOf());

      return {
        name: c.displayName,
        expirationDate
      };
    });

    // delete the secrets from the manifest so that we won't try to set them
    // from the manifest
    delete manifest.passwordCredentials;

    return secrets;
  }

  private updatePreAuthorizedAppsFromManifest(manifest: any, appInfo: AppInfo): Promise<AppInfo> {
    if (!manifest ||
      !manifest.preAuthorizedApplications ||
      manifest.preAuthorizedApplications.length === 0) {
      return Promise.resolve(appInfo);
    }

    const graphManifest: any = {
      api: {
        preAuthorizedApplications: manifest.preAuthorizedApplications
      }
    };

    graphManifest.api.preAuthorizedApplications.forEach((p: any) => {
      p.delegatedPermissionIds = p.permissionIds;
      delete p.permissionIds;
    });

    const updateAppRequestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/applications/${appInfo.id}`,
      headers: {
        'content-type': 'application/json'
      },
      responseType: 'json',
      data: graphManifest
    };

    return request
      .patch(updateAppRequestOptions)
      .then(_ => Promise.resolve(appInfo));
  }

  private createSecrets(secrets: { name: string, expirationDate: Date }[], appInfo: AppInfo): Promise<AppInfo> {
    if (secrets.length === 0) {
      return Promise.resolve(appInfo);
    }

    return Promise
      .all(secrets.map(secret => this.createSecret({
        appObjectId: appInfo.id,
        displayName: secret.name,
        expirationDate: secret.expirationDate
      })))
      .then(secrets => {
        appInfo.secrets = secrets;
        return appInfo;
      });
  }

  private transformManifest(v2Manifest: any): any {
    const graphManifest = JSON.parse(JSON.stringify(v2Manifest));
    // add missing properties
    if (!graphManifest.api) {
      graphManifest.api = {};
    }
    if (!graphManifest.info) {
      graphManifest.info = {};
    }
    if (!graphManifest.web) {
      graphManifest.web = {
        implicitGrantSettings: {},
        redirectUris: []
      };
    }
    if (!graphManifest.spa) {
      graphManifest.spa = {
        redirectUris: []
      };
    }

    // remove properties that have no equivalent in v1.6
    const unsupportedProperties = [
      'accessTokenAcceptedVersion',
      'disabledByMicrosoftStatus',
      'errorUrl',
      'oauth2RequirePostResponse',
      'oauth2AllowUrlPathMatching',
      'orgRestrictions',
      'samlMetadataUrl'
    ];
    unsupportedProperties.forEach(p => delete graphManifest[p]);

    graphManifest.api.acceptMappedClaims = v2Manifest.acceptMappedClaims;
    delete graphManifest.acceptMappedClaims;

    graphManifest.isFallbackPublicClient = v2Manifest.allowPublicClient;
    delete graphManifest.allowPublicClient;

    graphManifest.info.termsOfServiceUrl = v2Manifest.informationalUrls?.termsOfService;
    graphManifest.info.supportUrl = v2Manifest.informationalUrls?.support;
    graphManifest.info.privacyStatementUrl = v2Manifest.informationalUrls?.privacy;
    graphManifest.info.marketingUrl = v2Manifest.informationalUrls?.marketing;
    delete graphManifest.informationalUrls;

    graphManifest.api.knownClientApplications = v2Manifest.knownClientApplications;
    delete graphManifest.knownClientApplications;

    graphManifest.info.logoUrl = v2Manifest.logoUrl;
    delete graphManifest.logoUrl;

    graphManifest.web.logoutUrl = v2Manifest.logoutUrl;
    delete graphManifest.logoutUrl;

    graphManifest.displayName = v2Manifest.name;
    delete graphManifest.name;

    graphManifest.web.implicitGrantSettings.enableAccessTokenIssuance = v2Manifest.oauth2AllowImplicitFlow;
    delete graphManifest.oauth2AllowImplicitFlow;

    graphManifest.web.implicitGrantSettings.enableIdTokenIssuance = v2Manifest.oauth2AllowIdTokenImplicitFlow;
    delete graphManifest.oauth2AllowIdTokenImplicitFlow;

    graphManifest.api.oauth2PermissionScopes = v2Manifest.oauth2Permissions;
    delete graphManifest.oauth2Permissions;
    if (graphManifest.api.oauth2PermissionScopes) {
      graphManifest.api.oauth2PermissionScopes.forEach((scope: any) => {
        delete scope.lang;
        delete scope.origin;
      });
    }

    delete graphManifest.oauth2RequiredPostResponse;

    // MS Graph doesn't support creating OAuth2 permissions and pre-authorized
    // apps in one request. This is why we need to remove it here and do it in
    // the next request
    delete graphManifest.preAuthorizedApplications;

    if (v2Manifest.replyUrlsWithType) {
      v2Manifest.replyUrlsWithType.forEach((urlWithType: any) => {
        if (urlWithType.type === 'Web') {
          graphManifest.web.redirectUris.push(urlWithType.url);
          return;
        }
        if (urlWithType.type === 'Spa') {
          graphManifest.spa.redirectUris.push(urlWithType.url);
          return;
        }
      });
      delete graphManifest.replyUrlsWithType;
    }

    graphManifest.web.homePageUrl = v2Manifest.signInUrl;
    delete graphManifest.signInUrl;

    if (graphManifest.appRoles) {
      graphManifest.appRoles.forEach((role: any) => {
        delete role.lang;
      });
    }

    return graphManifest;
  }

  private configureUri(args: CommandArgs, appInfo: AppInfo, logger: Logger): Promise<AppInfo> {
    if (!args.options.uri) {
      return Promise.resolve(appInfo);
    }

    if (this.verbose) {
      logger.logToStderr(`Configuring Azure AD application ID URI...`);
    }

    const applicationInfo: any = {};

    if (args.options.uri) {
      const appUri: string = args.options.uri.replace(/_appId_/g, appInfo.appId);
      applicationInfo.identifierUris = [appUri];
    }

    if (args.options.scopeName) {
      applicationInfo.api = {
        oauth2PermissionScopes: [{
          adminConsentDescription: args.options.scopeAdminConsentDescription,
          adminConsentDisplayName: args.options.scopeAdminConsentDisplayName,
          id: v4(),
          type: args.options.scopeConsentBy === 'adminsAndUsers' ? 'User' : 'Admin',
          value: args.options.scopeName
        }]
      };
    }

    const requestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/applications/${appInfo.id}`,
      headers: {
        'content-type': 'application/json;odata.metadata=none'
      },
      responseType: 'json',
      data: applicationInfo
    };

    return request
      .patch(requestOptions)
      .then(_ => appInfo);
  }

  private resolveApis(args: CommandArgs, logger: Logger): Promise<RequiredResourceAccess[]> {
    if (!args.options.apisDelegated && !args.options.apisApplication
      && (typeof this.manifest?.requiredResourceAccess === 'undefined' || this.manifest.requiredResourceAccess.length === 0)) {
      return Promise.resolve([]);
    }

    if (this.verbose) {
      logger.logToStderr('Resolving requested APIs...');
    }

    return odata
      .getAllItems<ServicePrincipalInfo>(`${this.resource}/v1.0/myorganization/servicePrincipals?$select=appId,appRoles,id,oauth2PermissionScopes,servicePrincipalNames`)
      .then(servicePrincipals => {
        let resolvedApis: RequiredResourceAccess[] = [];

        try {
          if (args.options.apisDelegated || args.options.apisApplication) {
            resolvedApis = this.getRequiredResourceAccessForApis(servicePrincipals, args.options.apisDelegated, 'Scope', logger);
            if (this.verbose) {
              logger.logToStderr(`Resolved delegated permissions: ${JSON.stringify(resolvedApis, null, 2)}`);
            }
            const resolvedApplicationApis = this.getRequiredResourceAccessForApis(servicePrincipals, args.options.apisApplication, 'Role', logger);
            if (this.verbose) {
              logger.logToStderr(`Resolved application permissions: ${JSON.stringify(resolvedApplicationApis, null, 2)}`);
            }
            // merge resolved application APIs onto resolved delegated APIs
            resolvedApplicationApis.forEach(resolvedRequiredResource => {
              const requiredResource = resolvedApis.find(api => api.resourceAppId === resolvedRequiredResource.resourceAppId);
              if (requiredResource) {
                requiredResource.resourceAccess.push(...resolvedRequiredResource.resourceAccess);
              }
              else {
                resolvedApis.push(resolvedRequiredResource);
              }
            });
          }
          else {
            const manifestApis = (this.manifest.requiredResourceAccess as RequiredResourceAccess[]);

            manifestApis.forEach(manifestApi => {
              resolvedApis.push(manifestApi);

              const app = servicePrincipals.find(servicePrincipals => servicePrincipals.appId === manifestApi.resourceAppId);

              if (app) {
                manifestApi.resourceAccess.forEach((res => {
                  const resourceAccessPermission = {
                    id: res.id,
                    type: res.type
                  };

                  const oAuthValue = app.oauth2PermissionScopes.find(scp => scp.id === res.id)?.value;
                  this.updateAppPermissions(app.id, resourceAccessPermission, oAuthValue);
                }));
              }
            });
          }

          if (this.verbose) {
            logger.logToStderr(`Merged delegated and application permissions: ${JSON.stringify(resolvedApis, null, 2)}`);
            logger.logToStderr(`App role assignments: ${JSON.stringify(this.appPermissions.flatMap(permission => permission.resourceAccess.filter(access => access.type === "Role")), null, 2)}`);
            logger.logToStderr(`OAuth2 permissions: ${JSON.stringify(this.appPermissions.flatMap(permission => permission.scope), null, 2)}`);
          }

          return Promise.resolve(resolvedApis);
        }
        catch (e) {
          return Promise.reject(e);
        }
      });
  }

  private getRequiredResourceAccessForApis(servicePrincipals: ServicePrincipalInfo[], apis: string | undefined, scopeType: string, logger: Logger): RequiredResourceAccess[] {
    if (!apis) {
      return [];
    }

    const resolvedApis: RequiredResourceAccess[] = [];
    const requestedApis: string[] = apis!.split(',').map(a => a.trim());
    requestedApis.forEach(api => {
      const pos: number = api.lastIndexOf('/');
      const permissionName: string = api.substr(pos + 1);
      const servicePrincipalName: string = api.substr(0, pos);
      if (this.debug) {
        logger.logToStderr(`Resolving ${api}...`);
        logger.logToStderr(`Permission name: ${permissionName}`);
        logger.logToStderr(`Service principal name: ${servicePrincipalName}`);
      }
      const servicePrincipal = servicePrincipals.find(sp => (
        sp.servicePrincipalNames.indexOf(servicePrincipalName) > -1 ||
        sp.servicePrincipalNames.indexOf(`${servicePrincipalName}/`) > -1));
      if (!servicePrincipal) {
        throw `Service principal ${servicePrincipalName} not found`;
      }

      const scopesOfType = scopeType === 'Scope' ? servicePrincipal.oauth2PermissionScopes : servicePrincipal.appRoles;
      const permission = scopesOfType.find(scope => scope.value === permissionName);
      if (!permission) {
        throw `Permission ${permissionName} for service principal ${servicePrincipalName} not found`;
      }

      let resolvedApi = resolvedApis.find(a => a.resourceAppId === servicePrincipal.appId);
      if (!resolvedApi) {
        resolvedApi = {
          resourceAppId: servicePrincipal.appId,
          resourceAccess: []
        };
        resolvedApis.push(resolvedApi);
      }

      const resourceAccessPermission = {
        id: permission.id,
        type: scopeType
      };

      resolvedApi.resourceAccess.push(resourceAccessPermission);

      this.updateAppPermissions(servicePrincipal.id, resourceAccessPermission, permission.value);
    });

    return resolvedApis;
  }

  private updateAppPermissions(spId: string, resourceAccessPermission: ResourceAccess, oAuth2PermissionValue?: string): void {
    // During API resolution, we store globally both app role assignments and oauth2permissions
    // So that we'll be able to parse them during the admin consent process
    let existingPermission = this.appPermissions.find(oauth => oauth.resourceId === spId);
    if (!existingPermission) {
      existingPermission = {
        resourceId: spId,
        resourceAccess: [],
        scope: []
      };

      this.appPermissions.push(existingPermission);
    }

    if (resourceAccessPermission.type === 'Scope' && oAuth2PermissionValue && !existingPermission.scope.find(scp => scp === oAuth2PermissionValue)) {
      existingPermission.scope.push(oAuth2PermissionValue);
    }

    if (!existingPermission.resourceAccess.find(res => res.id === resourceAccessPermission.id)) {
      existingPermission.resourceAccess.push(resourceAccessPermission);
    }
  }

  private configureSecret(args: CommandArgs, appInfo: AppInfo, logger: Logger): Promise<AppInfo> {
    if (!args.options.withSecret || (appInfo.secrets && appInfo.secrets.length > 0)) {
      return Promise.resolve(appInfo);
    }

    if (this.verbose) {
      logger.logToStderr(`Configure Azure AD app secret...`);
    }

    return this
      .createSecret({ appObjectId: appInfo.id })
      .then(secret => {
        appInfo.secret = secret.value;
        appInfo.secrets = [{ displayName: secret.displayName, value: secret.value }];
        return Promise.resolve(appInfo);
      });
  }

  private createSecret({ appObjectId, displayName = undefined, expirationDate = undefined }: { appObjectId: string, displayName?: string, expirationDate?: Date }): Promise<{ displayName: string, value: string }> {
    let secretExpirationDate = expirationDate;
    if (!secretExpirationDate) {
      secretExpirationDate = new Date();
      secretExpirationDate.setFullYear(secretExpirationDate.getFullYear() + 1);
    }

    const secretName = displayName ?? 'Default';

    const requestOptions: any = {
      url: `${this.resource}/v1.0/myorganization/applications/${appObjectId}/addPassword`,
      headers: {
        'content-type': 'application/json'
      },
      responseType: 'json',
      data: {
        passwordCredential: {
          displayName: secretName,
          endDateTime: secretExpirationDate.toISOString()
        }
      }
    };

    return request
      .post<{ secretText: string }>(requestOptions)
      .then((password: { secretText: string; }) => Promise.resolve({
        displayName: secretName,
        value: password.secretText
      }));
  }

  private getCertificateBase64Encoded(args: CommandArgs, logger: Logger): string {
    if (args.options.certificateBase64Encoded) {
      return args.options.certificateBase64Encoded;
    }

    if (this.debug) {
      logger.logToStderr(`Reading existing ${args.options.certificateFile}...`);
    }

    try {
      return fs.readFileSync(args.options.certificateFile as string, { encoding: 'base64' });
    }
    catch (e) {
      throw new Error(`Error reading certificate file: ${e}. Please add the certificate using base64 option '--certificateBase64Encoded'.`);
    }
  }

  private saveAppInfo(args: CommandArgs, appInfo: AppInfo, logger: Logger): Promise<AppInfo> {
    if (!args.options.save) {
      return Promise.resolve(appInfo);
    }

    const filePath: string = '.m365rc.json';

    if (this.verbose) {
      logger.logToStderr(`Saving Azure AD app registration information to the ${filePath} file...`);
    }

    let m365rc: M365RcJson = {};
    if (fs.existsSync(filePath)) {
      if (this.debug) {
        logger.logToStderr(`Reading existing ${filePath}...`);
      }

      try {
        const fileContents: string = fs.readFileSync(filePath, 'utf8');
        if (fileContents) {
          m365rc = JSON.parse(fileContents);
        }
      }
      catch (e) {
        logger.logToStderr(`Error reading ${filePath}: ${e}. Please add app info to ${filePath} manually.`);
        return Promise.resolve(appInfo);
      }
    }

    if (!m365rc.apps) {
      m365rc.apps = [];
    }

    m365rc.apps.push({
      appId: appInfo.appId,
      name: this.appName
    });

    try {
      fs.writeFileSync(filePath, JSON.stringify(m365rc, null, 2));
    }
    catch (e) {
      logger.logToStderr(`Error writing ${filePath}: ${e}. Please add app info to ${filePath} manually.`);
    }

    return Promise.resolve(appInfo);
  }

  private translatePlatformToType(platform: string): string {
    if (platform === 'publicClient') {
      return 'InstalledClient';
    }

    return platform.charAt(0).toUpperCase() + platform.substring(1);
  }
}

module.exports = new AadAppAddCommand();