import { Duration, IResource, Resource, Stack } from '@aws-cdk/core';
import { Construct } from 'constructs';

import { CfnJobDefinition } from './batch.generated';
import { ContainerDefinition } from './container-definition';


/**
 * Construction properties of the {@link JobDefinition} construct.
 */
export interface JobDefinitionProps {
  /**
   * The name of the job definition.
   *
   * Up to 128 letters (uppercase and lowercase), numbers, hyphens, and underscores are allowed.
   *
   * @default Cloudformation-generated name
   */
  readonly jobDefinitionName?: string;

  /**
   * An object with various properties specific to container-based jobs.
   */
  readonly container: ContainerDefinition;

  /**
   * An object with various properties specific to multi-node parallel jobs.
   *
   * @default - undefined
   */
  readonly nodeProps?: IMultiNodeProps;

  /**
   * When you submit a job, you can specify parameters that should replace the
   * placeholders or override the default job definition parameters. Parameters
   * in job submission requests take precedence over the defaults in a job definition.
   * This allows you to use the same job definition for multiple jobs that use the same
   * format, and programmatically change values in the command at submission time.
   *
   * @link https://docs.aws.amazon.com/batch/latest/userguide/job_definition_parameters.html
   * @default - undefined
   */
  readonly parameters?: { [key: string]: string };

  /**
   * The number of times to move a job to the RUNNABLE status. You may specify between 1 and
   * 10 attempts. If the value of attempts is greater than one, the job is retried on failure
   * the same number of attempts as the value.
   *
   * @default 1
   */
  readonly retryAttempts?: number;

  /**
   * The timeout configuration for jobs that are submitted with this job definition. You can specify
   * a timeout duration after which AWS Batch terminates your jobs if they have not finished.
   *
   * @default - undefined
   */
  readonly timeout?: Duration;
}

/**
 * Properties for specifying multi-node properties for compute resources.
 */
export interface IMultiNodeProps {
  /**
   * Specifies the node index for the main node of a multi-node parallel job. This node index value must be fewer than the number of nodes.
   */
  mainNode: number;

  /**
   * A list of node ranges and their properties associated with a multi-node parallel job.
   */
  rangeProps: INodeRangeProps[];

  /**
   * The number of nodes associated with a multi-node parallel job.
   */
  count: number;
}

/**
 * Properties for a multi-node batch job.
 */
export interface INodeRangeProps {
  /**
   * The container details for the node range.
   */
  container: ContainerDefinition;

  /**
   * The minimum node index value to apply this container definition against.
   *
   * You may nest node ranges, for example 0:10 and 4:5, in which case the 4:5 range properties override the 0:10 properties.
   *
   * @default 0
   */
  fromNodeIndex?: number;

  /**
   * The maximum node index value to apply this container definition against. If omitted, the highest value is used relative.
   *
   * to the number of nodes associated with the job. You may nest node ranges, for example 0:10 and 4:5,
   * in which case the 4:5 range properties override the 0:10 properties.
   *
   * @default {@link IMultiNodeprops.count}
   */
  toNodeIndex?: number;
}

/**
 * An interface representing a job definition - either a new one, created with the CDK, *using the
 * {@link JobDefinition} class, or existing ones, referenced using the {@link JobDefinition.fromJobDefinitionArn} method.
 */
export interface IJobDefinition extends IResource {
  /**
   * The ARN of this batch job definition.
   *
   * @attribute
   */
  readonly jobDefinitionArn: string;

  /**
   * The name of the batch job definition.
   *
   * @attribute
   */
  readonly jobDefinitionName: string;
}

/**
 * Batch Job Definition.
 *
 * Defines a batch job definition to execute a specific batch job.
 */
export class JobDefinition extends Resource implements IJobDefinition {
  /**
   * Imports an existing batch job definition by its amazon resource name.
   *
   * @param scope
   * @param id
   * @param jobDefinitionArn
   */
  public static fromJobDefinitionArn(scope: Construct, id: string, jobDefinitionArn: string): IJobDefinition {
    const stack = Stack.of(scope);
    const jobDefName = stack.parseArn(jobDefinitionArn).resourceName!;

    class Import extends Resource implements IJobDefinition {
      public readonly jobDefinitionArn = jobDefinitionArn;
      public readonly jobDefinitionName = jobDefName;
    }

    return new Import(scope, id);
  }

  /**
   * Imports an existing batch job definition by its name.
   * If name is specified without a revision then the latest active revision is used.
   *
   * @param scope
   * @param id
   * @param jobDefinitionName
   */
  public static fromJobDefinitionName(scope: Construct, id: string, jobDefinitionName: string): IJobDefinition {
    const stack = Stack.of(scope);
    const jobDefArn = stack.formatArn({
      service: 'batch',
      resource: 'job-definition',
      sep: '/',
      resourceName: jobDefinitionName,
    });

    class Import extends Resource implements IJobDefinition {
      public readonly jobDefinitionArn = jobDefArn;
      public readonly jobDefinitionName = jobDefinitionName;
    }

    return new Import(scope, id);
  }

  public readonly jobDefinitionArn: string;
  public readonly jobDefinitionName: string;

  constructor(scope: Construct, id: string, props: JobDefinitionProps) {
    super(scope, id, {
      physicalName: props.jobDefinitionName,
    });

    const jobDef = new CfnJobDefinition(this, 'Resource', {
      jobDefinitionName: props.jobDefinitionName,
      containerProperties: this.buildJobContainer(props.container),
      type: 'container',
      nodeProperties: props.nodeProps
        ? {
          mainNode: props.nodeProps.mainNode,
          nodeRangeProperties: this.buildNodeRangeProps(props.nodeProps),
          numNodes: props.nodeProps.count,
        }
        : undefined,
      parameters: props.parameters,
      retryStrategy: {
        attempts: props.retryAttempts || 1,
      },
      timeout: {
        attemptDurationSeconds: props.timeout ? props.timeout.toSeconds() : undefined,
      },
    });

    this.jobDefinitionArn = this.getResourceArnAttribute(jobDef.ref, {
      service: 'batch',
      resource: 'job-definition',
      resourceName: this.physicalName,
    });
    this.jobDefinitionName = this.getResourceNameAttribute(jobDef.ref);
  }

  private buildJobContainer(container?: ContainerDefinition): CfnJobDefinition.ContainerPropertiesProperty | undefined {
    if (container === undefined) {
      return undefined;
    }

    return container.renderContainerDefinition();
  }

  private buildNodeRangeProps(multiNodeProps: IMultiNodeProps): CfnJobDefinition.NodeRangePropertyProperty[] {
    const rangeProps = new Array<CfnJobDefinition.NodeRangePropertyProperty>();

    for (const prop of multiNodeProps.rangeProps) {
      rangeProps.push({
        container: this.buildJobContainer(prop.container),
        targetNodes: `${prop.fromNodeIndex || 0}:${prop.toNodeIndex || multiNodeProps.count}`,
      });
    }

    return rangeProps;
  }
}
