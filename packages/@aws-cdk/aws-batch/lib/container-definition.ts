import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as cdk from '@aws-cdk/core';

import { Construct } from 'constructs';
import { CfnJobDefinition } from './batch.generated';
import { ContainerImage, ContainerImageConfig } from './container-image';
import { FargatePlatformVersion } from './fargate-service';
import { LinuxParameters } from './linux-parameters';
import { LogDriverConfig } from './log-drivers';
import { ResourceRequirements } from './resource-requirements';
import { TaskDefinition } from './task-definition';

// keep this import separate from other imports to reduce chance for merge conflicts with v2-main
// eslint-disable-next-line no-duplicate-imports, import/order
import { Construct as CoreConstruct } from '@aws-cdk/core';

/*
 * The properties for creating a Batch job definition container.
 */
export interface ContainerProperties {
  /**
   * Indicates whether the job should have a public IP.
   *
   * This property is ignored for the EC2 launch type.
   * @default false
   */
  readonly assignPublicIp?: boolean;

  /**
   * The command that is passed to the container.
   *
   * If you provide a shell command as a single string, you have to quote command-line arguments.
   *
   * @default - CMD value built into container image.
   */
  readonly command?: [ string ];

  /**
   * The environment variables to pass to the container.
   *
   * @default - No environment variables.
   */
  readonly environment?: { [key: string]: string };

  /**
   * The execution role that AWS Batch can assume. For jobs that run on Fargate resources, this field is required.
   * @link https://docs.aws.amazon.com/batch/latest/userguide/execution-IAM-role.html
   * @default none
   */
  readonly executionRole?: iam.Role;

  /**
   * The AWS Fargate platform version to target when running a Batch job using the Fargate launch type.
   *
   * @default LATEST
   */
  readonly fargatePlatformVersion?: FargatePlatformVersion;

  /**
   * The image used to start a container.
   *
   * This string is passed directly to the Docker daemon.
   * Images in the Docker Hub registry are available by default.
   * Other repositories are specified with either repository-url/image:tag or repository-url/image@digest.
   */
  readonly image: ContainerImage;

  /**
   * The type of instane to launch as for multi-parallel jobs. All node groups in a multi-node parallel job must use the same instance type.
   *
   * This property is ignored for single-node container and fargate launch type jobs.
   * @default none
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * The batch job role that the container can assume for AWS permissions.
   * @link https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
   * @default none
   */
  readonly jobRole?: iam.Role;

  /**
   * Linux-specific modifications that are applied to the container, such as Linux kernel capabilities.
   * For more information see [KernelCapabilities](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_KernelCapabilities.html).
   *
   * @default - No Linux parameters.
   */
  readonly linuxParameters?: LinuxParameters;

  /**
   * The log configuration specification for the container.
   *
   * @default - Containers use the same logging driver that the Docker daemon uses.
   */
  readonly logDriverConfig?: LogDriverConfig;

  /**
   * The type and amount of resources to assign to a container.
   */
  readonly resourceRequirements?: ResourceRequirements;

  /**
   * The mount points for data volumes.
   *
   * @default none
   */
  readonly mountPoints?: [ MountPoint ];

  /**
   * When this parameter is true, the container is given elevated permissions to the host container instance.
   *
   * @default false
   */
  readonly privileged?: boolean;

  /**
   * When this parameter is true, the container is given read-only permission to its root filesystem.
   *
   * @default false
   */
  readonly readonlyRootFilesystem?: boolean;

  /**
   * The secrets for the container.
   *
   * @default none
   */
  readonly secrets?: [ secretsmanager.Secret ];

  /**
   * An array of ulimits to set in the container.
   */
  readonly ulimits?: [ Ulimit ];

  /**
   * The user name to use inside the container.
   *
   * @default root
   */
  readonly user?: string;

  readonly volumes?: [ Volume ];
}

/**
 * A container definition is used in a task definition to describe the containers that are launched as part of a task.
 */
export class ContainerDefinition extends CoreConstruct {
  /**
   * The name of the container properties that includes this container definition.
   */
  public readonly containerProperties: ContainerProperties;

  /**
   * The Linux-specific modifications that are applied to the container, such as Linux kernel capabilities.
   */
  public readonly linuxParameters?: LinuxParameters;

  /**
   * The mount points for data volumes in your container.
   */
  public readonly mountPoints = new Array<MountPoint>();

  /**
   * An array of ulimits to set in the container.
   */
  public readonly ulimits = new Array<Ulimit>();

  /**
   * The log configuration specification for the container.
   */
  public readonly logDriverConfig?: LogDriverConfig;

  private _executionRole?: iam.Role;

  private readonly imageConfig: ContainerImageConfig;

  private readonly secrets: secretsmanager.Secret[];

  /**
   * Constructs a new instance of the ContainerDefinition class.
   */
  constructor(scope: Construct, id: string, containerProperties: ContainerProperties) {
    super(scope, id);

    this.containerProperties = containerProperties;
    this._executionRole = containerProperties.executionRole;
    this.linuxParameters = containerProperties.linuxParameters;
    this.mountPoints = containerProperties.mountPoints || [];
    this.imageConfig = containerProperties.image.bind(this, this);
    this.secrets = containerProperties.secrets || [];

    for (const secret of this.secrets) {
      if (containerProperties.jobRole) {
        secret.grantRead(containerProperties.jobRole);
      }
      this.secrets.push(secret);
    }
  }

  /**
   * This method adds one or more mount points for data volumes to the container.
   */
  public addMountPoints(...mountPoints: MountPoint[]) {
    this.mountPoints.push(...mountPoints);
  }

  /**
   * This method mounts temporary disk space to the container.
   *
   * This adds the correct container mountPoint and task definition volume.
   */
  public addScratch(scratch: ScratchSpace) {
    const mountPoint = {
      containerPath: scratch.containerPath,
      readOnly: scratch.readOnly,
      sourceVolume: scratch.name,
    };

    const volume = {
      host: {
        sourcePath: scratch.sourcePath,
      },
      name: scratch.name,
    };

    this.containerProperties.volumes?.push(volume);
    this.addMountPoints(mountPoint);
  }

  /**
   * This method adds one or more ulimits to the container.
   */
  public addUlimits(...ulimits: Ulimit[]) {
    this.ulimits.push(...ulimits);
  }

  /**
   * Creates the task execution IAM role if it doesn't already exist.
   */
  public obtainExecutionRole(): iam.IRole {
    if (!this._executionRole) {
      this._executionRole = new iam.Role(this, 'ExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      });
    }
    return this._executionRole;
  }

  /**
   * Render this container definition to a CloudFormation object
   *
   * @param _taskDefinition [disable-awslint:ref-via-interface] (unused but kept to avoid breaking change)
   */
  public renderContainerDefinition(_taskDefinition?: TaskDefinition): CfnJobDefinition.ContainerPropertiesProperty {
    return {
      networkConfiguration: {
        assignPublicIp: this.containerProperties.assignPublicIp ? 'ENABLED' : 'DISABLED',
      },
      image: this.imageConfig.imageName,
      command: this.containerProperties.command,
      environment: this.containerProperties.environment && renderKV(this.containerProperties.environment, 'name', 'value'),
      executionRoleArn: this.obtainExecutionRole().roleArn,
      fargatePlatformConfiguration: {
        platformVersion: this.containerProperties.fargatePlatformVersion,
      },
      instanceType: this.containerProperties.instanceType?.toString(),
      jobRoleArn: this.containerProperties.jobRole?.roleArn,
      linuxParameters: this.linuxParameters?.renderLinuxParameters(),
      logConfiguration: this.logDriverConfig?.renderLogDriver(),
      mountPoints: this.mountPoints,
      privileged: this.containerProperties.privileged,
      readonlyRootFilesystem: this.containerProperties.readonlyRootFilesystem,
      resourceRequirements: this.containerProperties.resourceRequirements?.renderResourceRequirements(),
      secrets: cdk.Lazy.any({ produce: () => this.secrets.map(renderSecret) }, { omitEmptyArray: true }),
      ulimits: cdk.Lazy.any({ produce: () => this.containerProperties.ulimits?.map(renderUlimit) }, { omitEmptyArray: true }),
      user: this.containerProperties.user,
      volumes: this.containerProperties.volumes,
    };
  }
}

function renderKV(env: { [key: string]: string }, keyName: string, valueName: string): any[] {
  const ret = [];
  for (const [key, value] of Object.entries(env)) {
    ret.push({ [keyName]: key, [valueName]: value });
  }
  return ret;
}

function renderSecret(secret: secretsmanager.Secret): CfnJobDefinition.SecretProperty {
  return {
    name: secret.secretName,
    valueFrom: secret.secretArn,
  };
}

/**
 * The ulimit settings to pass to the container.
 *
 * NOTE: Does not work for Windows containers.
 */
export interface Ulimit {
  /**
   * The type of the ulimit.
   *
   * For more information, see [UlimitName](https://docs.aws.amazon.com/cdk/api/latest/typescript/api/aws-ecs/ulimitname.html#aws_ecs_UlimitName).
   */
  readonly name: UlimitName,

  /**
   * The soft limit for the ulimit type.
   */
  readonly softLimit: number,

  /**
   * The hard limit for the ulimit type.
   */
  readonly hardLimit: number,
}

/**
 * Type of resource to set a limit on
 */
export enum UlimitName {
  CORE = 'core',
  CPU = 'cpu',
  DATA = 'data',
  FSIZE = 'fsize',
  LOCKS = 'locks',
  MEMLOCK = 'memlock',
  MSGQUEUE = 'msgqueue',
  NICE = 'nice',
  NOFILE = 'nofile',
  NPROC = 'nproc',
  RSS = 'rss',
  RTPRIO = 'rtprio',
  RTTIME = 'rttime',
  SIGPENDING = 'sigpending',
  STACK = 'stack'
}

function renderUlimit(ulimit: Ulimit): CfnJobDefinition.UlimitProperty {
  return {
    name: ulimit.name,
    softLimit: ulimit.softLimit,
    hardLimit: ulimit.hardLimit,
  };
}
/**
 * The details of a dependency on another container in the task definition.
 *
 * @see https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDependency.html
 */
export interface ContainerDependency {
  /**
   * The container to depend on.
   */
  readonly container: ContainerDefinition;

  /**
   * The state the container needs to be in to satisfy the dependency and proceed with startup.
   * Valid values are ContainerDependencyCondition.START, ContainerDependencyCondition.COMPLETE,
   * ContainerDependencyCondition.SUCCESS and ContainerDependencyCondition.HEALTHY.
   *
   * @default ContainerDependencyCondition.HEALTHY
   */
  readonly condition?: ContainerDependencyCondition;
}

export enum ContainerDependencyCondition {
  /**
   * This condition emulates the behavior of links and volumes today.
   * It validates that a dependent container is started before permitting other containers to start.
   */
  START = 'START',

  /**
   * This condition validates that a dependent container runs to completion (exits) before permitting other containers to start.
   * This can be useful for nonessential containers that run a script and then exit.
   */
  COMPLETE = 'COMPLETE',

  /**
   * This condition is the same as COMPLETE, but it also requires that the container exits with a zero status.
   */
  SUCCESS = 'SUCCESS',

  /**
   * This condition validates that the dependent container passes its Docker health check before permitting other containers to start.
   * This requires that the dependent container has health checks configured. This condition is confirmed only at task startup.
   */
  HEALTHY = 'HEALTHY',
}

/**
 * The temporary disk space mounted to the container.
 */
export interface ScratchSpace {
  /**
   * The path on the container to mount the scratch volume at.
   */
  readonly containerPath: string,
  /**
   * Specifies whether to give the container read-only access to the scratch volume.
   *
   * If this value is true, the container has read-only access to the scratch volume.
   * If this value is false, then the container can write to the scratch volume.
   */
  readonly readOnly: boolean,
  readonly sourcePath: string,
  /**
   * The name of the scratch volume to mount. Must be a volume name referenced in the name parameter of task definition volume.
   */
  readonly name: string,
}

/**
 * The details of data volume mount points for a container.
 */
export interface MountPoint {
  /**
   * The path on the container to mount the host volume at.
   */
  readonly containerPath: string,
  /**
   * Specifies whether to give the container read-only access to the volume.
   *
   * If this value is true, the container has read-only access to the volume.
   * If this value is false, then the container can write to the volume.
   */
  readonly readOnly: boolean,
  /**
   * The name of the volume to mount.
   *
   * Must be a volume name referenced in the name parameter of task definition volume.
   */
  readonly sourceVolume: string,
}

export interface Volume {
  /**
   * The name of the volume. Up to 255 letters (uppercase and lowercase), numbers,
   * hyphens, and underscores are allowed. This name is referenced in the sourceVolume
   * parameter of container definition mountPoints.
   */
  readonly name?: string;

  /**
   * The path on the host container instance that's presented to the container.
   *
   * @link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-batch-jobdefinition-volumeshost.html#cfn-batch-jobdefinition-volumeshost-sourcepath
   */
  readonly hostPath?: string;
}
