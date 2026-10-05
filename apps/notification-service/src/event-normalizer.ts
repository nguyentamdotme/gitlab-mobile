import { z } from 'zod';
import { hash } from './crypto.js';
const numeric = z.number().int().positive();
const object = z.record(z.string(), z.unknown());
export function normalizeEvent(value: unknown, expectedProject: number, deliveryId?: string) {
  const payload = object.parse(value);
  const projectId = typeof payload.project_id === 'number' ? payload.project_id : object.parse(payload.project).id;
  if (numeric.parse(projectId) !== expectedProject) throw new Error('Project mismatch');
  const attributes = payload.object_attributes ? object.parse(payload.object_attributes) : {};
  let resource: 'pipelines' | 'jobs' | 'merge-requests' | 'issues' | 'environments' | 'deployments'; let id: number;
  switch (payload.object_kind) {
    case 'pipeline': resource = 'pipelines'; id = numeric.parse(attributes.id); break;
    case 'build': resource = 'jobs'; id = numeric.parse(payload.build_id); break;
    case 'merge_request': resource = 'merge-requests'; id = numeric.parse(attributes.iid); break;
    case 'deployment': resource = 'deployments'; id = numeric.parse(payload.deployment_id); break;
    case 'note': {
      if (attributes.noteable_type === 'MergeRequest') { resource = 'merge-requests'; id = numeric.parse(object.parse(payload.merge_request).iid); }
      else if (attributes.noteable_type === 'Issue') { resource = 'issues'; id = numeric.parse(object.parse(payload.issue).iid); }
      else throw new Error('Unsupported note type');
      break;
    }
    default: throw new Error('Unsupported event');
  }
  const identity = deliveryId || JSON.stringify([payload.object_kind, id, attributes.id || '', attributes.updated_at || payload.build_finished_at || payload.status_changed_at || '', attributes.status || payload.build_status || payload.status || '', attributes.action || '']);
  return { resource, id, dedupHash: hash(`${expectedProject}|${resource}|${identity}`) };
}
