import * as ecs from '@aws-cdk/aws-ecs';

import { Construct } from 'constructs';
import { ContainerDefinition } from './container-definition';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

/**
 * The configuration for creating a batch container image.
 */
export class JobDefinitionImageConfig {
  /**
   * Specifies the name of the container image
   */
  public readonly imageName: string;

  constructor(scope: Construct, container: ContainerDefinition) {
    const config = this.bindImageConfig(scope, container);

    this.imageName = config.imageName;
  }

  private bindImageConfig(scope: Construct, container: ContainerDefinition): ecs.ContainerImageConfig {
    return container.props.image.bind(scope as CoreConstruct, new ContainerDefinition(scope, 'Resource-Batch-Job-Container-Definition', container.props));
  }
}
