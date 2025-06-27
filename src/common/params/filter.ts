import { FFmpegFilterDetail, FilterLine, FilterNode } from '@common/types';

export const filtersList: FFmpegFilterDetail[] = [];

// 通过 lines 中的连接信息，将 nodes 中的输入输出和端口进行关联
export const associateNodesAndLines = (nodes: FilterNode[], lines: FilterLine[]) => {
	// 先将 nodes 转换为映射，方便后续查找
	const nodeMap: Record<number, FilterNode> = {};
	nodes.forEach((node) => {
		nodeMap[node.id] = node;
		if (!node.prevs) {
			node.prevs = [];
		}
		if (!node.nexts) {
			node.nexts = [];
		}
	});
	// 然后用 line 将 node 连接起来
	for (const line of lines) {
		if (!line) {
			continue;
		}
		// 找 node
		const fromNode = nodeMap[line.prevNodeId];
		const toNode = nodeMap[line.nextNodeId];
		if (!fromNode || !toNode) {
			console.warn(`滤镜线段 ${line} 连接的节点不存在：${fromNode}, ${toNode}`);
			continue;
		}
		// 连接
		fromNode.nexts[line.prevNodePortIndex] = line;
		toNode.prevs[line.nextNodePortIndex] = line;
	}
};

export const associateNodesAndDetails = (nodes: FilterNode[]) => {
	for (const node of nodes) {
		if (!node.name.match(/(in)?(out)?_\d+/)) {
			const filterDetailItem = filtersList.find((filter) => filter.name === node.name);
			if (filterDetailItem) {
				node.detail = filterDetailItem;
			}
		}
	}
}

export const getFilterParam = (nodes: FilterNode[], lines: FilterLine[]) => {
	// filter_complex 只需要处理每个普通滤镜的节点即可，因为每个分号之间代表一个滤镜的配置（含输入和输出标签）
	// 最终输出不在这个函数做，而是在后面的函数中，遍历每个输出节点，然后 -map
	const filterLines = [];
	for (const node of nodes) {
		if (node.name.match(/^(in)|(out)_\d+$/)) {
			continue;
		}
		const inputLines = node.prevs.filter((prevLine) => prevLine);
		const inputLabels = inputLines.length ? inputLines.map((line) => `[${line.name}]`).join('') : '';
		const outputLines = node.nexts.filter((nextLine) => nextLine);
		const outputLabels = outputLines.length ? outputLines.map((line) => `[${line.name}]`).join('') : '';
		const filterParam = `${node.name}`;
		filterLines.push(`${inputLabels}${filterParam}${outputLabels}`);
	}

	return filterLines.length ? filterLines.join(';') : '';
}
