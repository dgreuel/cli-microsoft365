import * as assert from 'assert';
import * as sinon from 'sinon';
import appInsights from '../../../../appInsights';
import auth from '../../../../Auth';
import { Cli } from '../../../../cli/Cli';
import { CommandInfo } from '../../../../cli/CommandInfo';
import { Logger } from '../../../../cli/Logger';
import Command, { CommandError } from '../../../../Command';
import request from '../../../../request';
import { sinonUtil } from '../../../../utils/sinonUtil';
import commands from '../../commands';
const command: Command = require('./eventreceiver-remove');

describe(commands.EVENTRECEIVER_REMOVE, () => {
  let log: string[];
  let logger: Logger;
  let commandInfo: CommandInfo;
  let promptOptions: any;
  let deleteRequestStub: sinon.SinonStub;

  const eventReceiverResponseMultiple = JSON.stringify(
    [
      {
        "ReceiverAssembly": "Microsoft.SharePoint, Version=16.0.0.0, Culture=neutral, PublicKeyToken=71e9bce111e9429c",
        "ReceiverClass": "Microsoft.SharePoint.Internal.SitePages.Sharing.PageSharingEventReceiver",
        "ReceiverId": "625b1f4c-2869-457f-8b41-bed72059bb2b",
        "ReceiverName": "Microsoft.SharePoint.Internal.SitePages.Sharing.PageSharingEventReceiver",
        "SequenceNumber": 10000,
        "Synchronization": 1,
        "EventType": 309,
        "ReceiverUrl": null
      },
      {
        "ReceiverAssembly": "Microsoft.SharePoint, Version=16.0.0.0, Culture=neutral, PublicKeyToken=71e9bce111e9429c",
        "ReceiverClass": "Microsoft.SharePoint.Internal.SitePages.Sharing.PageSharingEventReceiver",
        "ReceiverId": "41ad359e-ac6a-4a5e-8966-a85492ca4f52",
        "ReceiverName": "Microsoft.SharePoint.Internal.SitePages.Sharing.PageSharingEventReceiver",
        "SequenceNumber": 10000,
        "Synchronization": 1,
        "EventType": 310,
        "ReceiverUrl": null
      }
    ]
  );

  const eventReceiverResponseSingle = JSON.stringify(
    [
      {
        "ReceiverAssembly": "Microsoft.SharePoint, Version=16.0.0.0, Culture=neutral, PublicKeyToken=71e9bce111e9429c",
        "ReceiverClass": "Microsoft.SharePoint.Internal.SitePages.Sharing.PageSharingEventReceiver",
        "ReceiverId": "625b1f4c-2869-457f-8b41-bed72059bb2b",
        "ReceiverName": "Microsoft.SharePoint.Internal.SitePages.Sharing.PageSharingEventReceiver",
        "SequenceNumber": 10000,
        "Synchronization": 1,
        "EventType": 309,
        "ReceiverUrl": null
      }
    ]
  );

  before(() => {
    sinon.stub(auth, 'restoreAuth').callsFake(() => Promise.resolve());
    sinon.stub(appInsights, 'trackEvent').callsFake(() => { });
    auth.service.connected = true;
    commandInfo = Cli.getCommandInfo(command);
  });

  beforeEach(() => {
    log = [];
    logger = {
      log: (msg: string) => {
        log.push(msg);
      },
      logRaw: (msg: string) => {
        log.push(msg);
      },
      logToStderr: (msg: string) => {
        log.push(msg);
      }
    };
    (command as any).items = [];

    sinon.stub(Cli, 'prompt').callsFake(async (options: any) => {
      promptOptions = options;
      return { continue: false };
    });

    promptOptions = undefined;

    deleteRequestStub = sinon.stub(request, 'delete').callsFake((opts: any) => {
      if (opts.url.indexOf('/eventreceivers?') !== -1) {
        return Promise.resolve();
      }
      return Promise.reject();
    });
  });

  afterEach(() => {
    sinonUtil.restore([
      Cli.executeCommandWithOutput,
      Cli.prompt,
      request.delete
    ]);
  });

  after(() => {
    sinonUtil.restore([
      appInsights.trackEvent,
      auth.restoreAuth
    ]);
    auth.service.connected = false;
  });

  it('has correct name', () => {
    assert.strictEqual(command.name.startsWith(commands.EVENTRECEIVER_REMOVE), true);
  });

  it('has a description', () => {
    assert.notStrictEqual(command.description, null);
  });

  it('passes validation when all required parameters are valid', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', name: 'PnP Test Event Receiver' } }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation when all required parameters are valid and list id and eventreceiver name is set', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listId: '935c13a0-cc53-4103-8b48-c1d0828eaa7f', name: 'PnP Test Receiver' } }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation when all required parameters are valid and list title', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listTitle: 'Demo List', name: 'PnP Test Receiver' } }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation when all required parameters are valid and list url and event receiver name', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listUrl: 'sites/hr-life/Lists/breakInheritance', name: 'PnP Test Receiver' } }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('fails validation if list title and id are specified together', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listTitle: 'Demo List', listId: '935c13a0-cc53-4103-8b48-c1d0828eaa7f', name: 'PnP Event Receiver' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if list id is invalid', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listId: 'invalid', name: 'PnP Event Receiver' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if list id is filled in and scope is set to site', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listId: '935c13a0-cc53-4103-8b48-c1d0828eaa7f', name: 'PnP Event Receiver', scope: 'site' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if list title is filled in and scope is set to site', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listTitle: 'Demo list', name: 'PnP Event Receiver', scope: 'site' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if list url is filled in and scope is set to site', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listUrl: 'sites/hr-life/Lists/breakInheritance', name: 'PnP Event Receiver', scope: 'site' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if title and id and url are specified together', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', listTitle: 'Demo List', listId: '935c13a0-cc53-4103-8b48-c1d0828eaa7f', listUrl: 'sites/hr-life/Lists/breakInheritance', name: 'PnP Event Receiver' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });
  
  
  it('fails validation if scope is invalid value', async () => {
    const actual = await command.validate({ options: { webUrl: 'https://contoso.sharepoint.com/sites/sales', scope: 'abc', name: 'PnP Event Receiver' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if webUrl is an invalid webUrl', async () => {
    const actual = await command.validate({ options: { webUrl: 'invalid', name: 'PnP Event Receiver' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('prompts before removing the event receiver when confirm option not passed', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });

    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', scope: 'site', name: 'PnP Test Receiver' } });

    let promptIssued = false;

    if (promptOptions && promptOptions.type === 'confirm') {
      promptIssued = true;
    }

    assert(promptIssued);
  });

  it('aborts removing the event receiver when prompt not confirmed', async () => {
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: false }
    ));

    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });

    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', scope: 'site', name: 'PnP Test Receiver' } });
    assert(deleteRequestStub.notCalled);
  });

  it('deletes event receiver when prompt confirmed (debug)', async () => {
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));

    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });

    });
    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', scope: 'site', name: 'PnP Test Receiver', confirm: true } });
    assert(deleteRequestStub.called);
  });

  it('deletes event receiver with specified name', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', scope: 'site', name: 'PnP Test Receiver' } });
    assert(deleteRequestStub.called);
  });

  it('deletes event receiver with by name from list retrieved by URL', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', name: 'PnP Test Receiver', listUrl: 'sites/hr-life/Lists/breakInheritance' } });
    assert(deleteRequestStub.called);
  });

  it('deletes event receiver with by name from list retrieved by ID', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', name: 'PnP Test Receiver', listId: '8fccab0d-78e5-4037-a6a7-0168f9359cd4' } });
    assert(deleteRequestStub.called);
  });

  it('deletes event receiver by specific id', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', scope: 'site', id: '625b1f4c-2869-457f-8b41-bed72059bb2b' } });
    assert(deleteRequestStub.called);
  });

  it('deletes event receiver by specific name from specific list retrieved by the list title', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseSingle
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await command.action(logger, { options: { webUrl: 'https://contoso.sharepoint.com/sites/portal', listTitle: 'Documents', name: 'PnP Test Receiver' } });
    assert(deleteRequestStub.called);
  });

  it('shows error when no event receiver is found by name', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: "[]"
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await assert.rejects(command.action(logger, { 
      options: { 
        webUrl: 'https://contoso.sharepoint.com/sites/portal', 
        scope: 'site', 
        name: 'PnP Test Receiver' 
      }
    }), new CommandError(`Specified event receiver with name PnP Test Receiver cannot be found`));  
  });

  it('shows error when no event receiver is found by id', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: "[]"
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));
    await assert.rejects(command.action(logger, { 
      options: { 
        webUrl: 'https://contoso.sharepoint.com/sites/portal', 
        scope: 'site', 
        id: '8fccab0d-78e5-4037-a6a7-0168f9359cd4' 
      }
    }), new CommandError(`Specified event receiver with id 8fccab0d-78e5-4037-a6a7-0168f9359cd4 cannot be found`));  
  });

  it('shows error when multiple event receivers are found by name', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseMultiple
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));

    await assert.rejects(command.action(logger, { 
      options: { 
        webUrl: 'https://contoso.sharepoint.com/sites/portal', 
        scope: 'site', 
        name: 'PnP Test Receiver' 
      }
    }), new CommandError(`Multiple eventreceivers with name PnP Test Receiver, ids: 625b1f4c-2869-457f-8b41-bed72059bb2b,41ad359e-ac6a-4a5e-8966-a85492ca4f52 found`));
  });

  it('shows error when multiple event receivers are found by id', async () => {
    sinon.stub(Cli, 'executeCommandWithOutput').callsFake((): Promise<any> => {
      return Promise.resolve({
        stdout: eventReceiverResponseMultiple
      });
    });
    sinonUtil.restore(Cli.prompt);
    sinon.stub(Cli, 'prompt').callsFake(async () => (
      { continue: true }
    ));

    await assert.rejects(command.action(logger, { 
      options: { 
        webUrl: 'https://contoso.sharepoint.com/sites/portal', 
        scope: 'site', 
        id: '8fccab0d-78e5-4037-a6a7-0168f9359cd4' 
      }
    }), new CommandError(`Multiple eventreceivers with id 8fccab0d-78e5-4037-a6a7-0168f9359cd4 found`));
  });


  it('supports debug mode', () => {
    const options = command.options;
    let containsOption = false;
    options.forEach(o => {
      if (o.option === '--debug') {
        containsOption = true;
      }
    });
    assert(containsOption);
  });

});