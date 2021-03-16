import { Construct } from 'constructs';
import { CfnJobDefinition } from './batch.generated';

/**
 * The resource requirement details for a Batch container.
 */
export interface ResourceRequirementProps {
  /**
   * The number of physical GPUs to reserve for the container. This should not exceed
   * the total number of available GPUs on the compute instance type that the job is launched on.
   *
   * GPUs is not assignable for the Batch Fargate launch type.
   *
   * @default none - no GPUs are reserved
   */
  readonly gpu?: number;

  /**
   * The memory hard limit (in MiB) to present to the container.
   *
   * For Fargate launch types, the value provided should match the supported memory value and
   * matching vCPU value of the desired Fargate resource tier.
   *
   * @link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-batch-jobdefinition-resourcerequirement.html
   *
   * @default - no hard memory limit is set
   */
  readonly memory?: number;

  /**
   * The number of vCPUs reserved for the container.
   *
   * For Fargate launch types, the value provided should match the supported memory value and
   * matching vCPU value of the desired Fargate resource tier.
   *
   * @link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-batch-jobdefinition-resourcerequirement.html
   *
   * @default - no vCPUs are reserved
   */
  readonly vcpu?: number;
}

export class ResourceRequirements extends Construct {
  private readonly requirements: ResourceRequirementProps;

  constructor(scope: Construct, id: string, props: ResourceRequirementProps = {}) {
    super(scope, id);

    this.requirements = props;
  }

  public renderResourceRequirements(): CfnJobDefinition.ResourceRequirementProperty[] {
    const props: CfnJobDefinition.ResourceRequirementProperty[] = [];

    if (this.requirements.gpu) {
      props.push({
        type: 'GPU',
        value: this.requirements.gpu.toString(),
      });
    }

    if (this.requirements.memory) {
      props.push({
        type: 'MEMORY',
        value: this.requirements.memory.toString(),
      });
    }

    if (this.requirements.vcpu) {
      props.push({
        type: 'VCPU',
        value: this.requirements.vcpu.toString(),
      });
    }

    return props;
  }
}
