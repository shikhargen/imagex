import type { ImageXProject } from '../../../shared/types.js';

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return btoa(binary);
}

export function projectWorkflows(project: ImageXProject): Array<{ id: string; title: string }> {
  const workflows = project.metadata.workflows?.length
    ? project.metadata.workflows
    : [{ id: project.workflow.id, title: project.workflow.name, file: project.metadata.workflowFile }];
  return workflows.map((workflow) => ({ id: workflow.id, title: workflow.title }));
}
