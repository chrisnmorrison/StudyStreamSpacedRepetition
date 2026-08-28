import { SRRecord } from "./settings";

export function remapRecordPath(
	path: string,
	oldPath: string,
	newPath: string,
	isFolder: boolean,
): string | null {
	if (path === oldPath) return newPath;
	if (!isFolder) return null;

	const oldPrefix = `${oldPath}/`;
	if (!path.startsWith(oldPrefix)) return null;
	return `${newPath}/${path.slice(oldPrefix.length)}`;
}

export function remapRecordPaths(
	records: Record<string, SRRecord>,
	oldPath: string,
	newPath: string,
	isFolder: boolean,
): number {
	const changes: Array<[string, string, SRRecord]> = [];

	for (const [path, record] of Object.entries(records)) {
		const remapped = remapRecordPath(path, oldPath, newPath, isFolder);
		if (remapped && remapped !== path) {
			changes.push([path, remapped, record]);
		}
	}

	for (const [oldRecordPath, newRecordPath, record] of changes) {
		if (!records[newRecordPath]) {
			records[newRecordPath] = record;
		}
		delete records[oldRecordPath];
	}

	return changes.length;
}
