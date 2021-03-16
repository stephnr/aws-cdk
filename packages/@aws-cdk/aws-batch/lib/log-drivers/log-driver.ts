import * as cdk from '@aws-cdk/core';

import { Construct } from 'constructs';

import { CfnJobDefinition } from '../batch.generated';
import { ContainerDefinition } from '../container-definition';
import { ExposedSecret } from '../exposed-secret';
import { AwsLogDriver, AwsLogDriverProps } from './aws-log-driver';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

/**
 * The base class for log drivers.
 */
export abstract class LogDriver {
  /**
   * Creates a log driver configuration that sends log information to CloudWatch Logs.
   */
  public static awsLogs(props: AwsLogDriverProps): LogDriver {
    return new AwsLogDriver(props);
  }

  /**
   * Called when the log driver is configured on a container
   */
  public abstract bind(scope: CoreConstruct, containerDefinition: ContainerDefinition): LogDriverConfig;
}

export enum Driver {
  AWSLOGS = 'awslogs',
  FLUENTD = 'fluentd',
  GELF = 'gelf',
  JOURNALD = 'journald',
  JSON_FILE = 'json-file',
  SPLUNK = 'splunk',
  SYSLOG = 'syslog',
}

export interface LogDriverProps {
  /**
   * The log driver to use for the container. The valid values listed for this parameter are log drivers
   * that the container agent can communicate with by default.
   *
   * For tasks using the Fargate launch type, the supported log drivers are awslogs, splunk, and awsfirelens.
   * For tasks using the EC2 launch type, the supported log drivers are awslogs, fluentd, gelf, json-file, journald,
   * syslog, and splunk.
   *
   * For more information about using the awslogs log driver, see
   * [Using the awslogs Log Driver](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html)
   * in the Amazon Elastic Container Service Developer Guide.
   */
  readonly logDriver: Driver;

  /**
   * The configuration options to send to the log driver.
   * @default none
   */
  readonly options?: { [key: string]: string };

  /**
   * The secrets to pass to the log configuration.
   * @link https://docs.aws.amazon.com/batch/latest/userguide/specifying-sensitive-data.html
   * @default none
   */
  readonly secretOptions?: [ ExposedSecret ];
}

/**
 * The configuration to use when creating a log driver.
 */
export class LogDriverConfig extends Construct {
  /**
   * The log driver to use for the container.
   */
  private readonly logDriver: Driver;

  /**
   * The configuration options to send to the log driver.
   * @default none
   */
  private readonly options?: { [key: string]: string };

  /**
   * The secrets to pass to the log configuration.
   * @link https://docs.aws.amazon.com/batch/latest/userguide/specifying-sensitive-data.html
   * @default none
   */
  private readonly secretOptions: ExposedSecret[];

  constructor(scope: Construct, id: string, props: LogDriverProps = { logDriver: Driver.AWSLOGS }) {
    super(scope, id);

    this.logDriver = props.logDriver;
    this.options = props.options;
    this.secretOptions = props.secretOptions || [];
  }

  /**
   * Adds one or more secrets to a LogDriver
   */
  public addSecrets(...secret: ExposedSecret[]) {
    this.secretOptions.push(...secret);
  }

  public renderLogDriver(): CfnJobDefinition.LogConfigurationProperty {
    return {
      logDriver: this.logDriver,
      options: this.options,
      secretOptions: cdk.Lazy.any({ produce: () => this.secretOptions.map(renderSecret) }, { omitEmptyArray: true }),
    };
  }
}

function renderSecret(secret: ExposedSecret): CfnJobDefinition.SecretProperty {
  return {
    name: secret.optionName,
    valueFrom: secret.secretArn,
  };
}
