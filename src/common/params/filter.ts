import { FFmpegFilterDetail, FilterLine, FilterNode } from '@common/types';

export const filtersList: FFmpegFilterDetail[] = [];

// // 通过 lines 中的连接信息，将 nodes 中的输入输出和端口进行关联
// export const associateNodesAndLines = (nodes: FilterNode[], lines: [string, string][]) => {
// 	// 先将 nodes 转换为映射，方便后续查找
// 	const nodeMap: Record<number, FilterNode> = {};
// 	nodes.forEach(node => {
// 		nodeMap[node.id] = node;
// 	});
// 	for (const line of lines) {
// 		// 提取字符串
// 		const fromMatch = line[0].match(/(\d+)_(\w+)/);	// nodeId_portName
// 		const toMatch = line[0].match(/(\d+)_(\w+)/);	// nodeId_portName
// 		if (!fromMatch || !toMatch) {
// 			console.warn(`滤镜线段无效：${line}`);
// 			continue;
// 		}
// 		// 通过字符串提取出来的 node id 去 nodes 里找对应的 node
// 		const fromNode = nodeMap[+fromMatch[1]];
// 		const toNode = nodeMap[+fromMatch[1]];
// 		if (!fromNode || !toNode) {
// 			console.warn(`滤镜线段 ${line} 连接的节点不存在：${fromNode}, ${toNode}`);
// 			continue;
// 		}
// 		// 分别对两端的两个 node 通过字符串提取出来的 port name 找它所在的索引（字符串里第二项的 name 对应第几个端口）
// 		const fromPortNameIndex = fromNode.outputPortNames.indexOf(fromMatch[2]);
// 		const toPortNameIndex = fromNode.inputPortNames.indexOf(fromMatch[2]);
// 		if (!fromPortNameIndex || !toPortNameIndex) {
// 			console.warn(`滤镜线段 ${line} 连接的端口不存在：${fromPortNameIndex}, ${toPortNameIndex}`);
// 			continue;
// 		}
// 		// 如果上面的东西都能找到，那么就把两边连起来（这边的 node.connections[第几个端口] -> 对面的 node）。至于连的是对面的哪个端口，这里不关心
// 		fromNode.outputPortConnections[fromPortNameIndex] = toNode;
// 		toNode.outputPortConnections[fromPortNameIndex] = fromNode;
// 	}
// };

// 通过 lines 中的连接信息，将 nodes 中的输入输出和端口进行关联
export const associateNodesAndLines = (nodes: FilterNode[], lines: FilterLine[]) => {
	// 先将 nodes 转换为映射，方便后续查找
	const nodeMap: Record<number, FilterNode> = {};
	nodes.forEach(node => {
		nodeMap[node.id] = node;
	});
	// 然后用 line 将 node 连接起来
	for (const line of lines) {
		// 找 node
		const fromNode = nodeMap[line.prevNodeId];
		const toNode = nodeMap[line.nextNodeId];
		if (!fromNode || !toNode) {
			console.warn(`滤镜线段 ${line} 连接的节点不存在：${fromNode}, ${toNode}`);
			continue;
		}
		// 连接
		fromNode.nexts[line.nextNodePortIndex] = line;
		toNode.prevs[line.prevNodePortIndex] = line;
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

// AI 生成，未验证
export const getFilterParam = (nodes: FilterNode[], lines: FilterLine[]) => {
	const inputMap: Record<string, string[]> = {}; // nodeId -> inputTag[]
	const outputMap: Record<string, string[]> = {}; // nodeId -> outputTag[]
	const labelSet = new Set<string>(); // 去重用

	// 为每条 line 分配标签名（如果已有就用它）
	for (const line of lines) {
		if (!line.name) continue;
		// 输入端：作为输出标签
		if (!outputMap[line.prevNodeId]) outputMap[line.prevNodeId] = [];
		outputMap[line.prevNodeId][line.prevNodePortIndex] = line.name;

		// 输出端：作为输入标签
		if (!inputMap[line.nextNodeId]) inputMap[line.nextNodeId] = [];
		inputMap[line.nextNodeId][line.nextNodePortIndex] = line.name;

		labelSet.add(line.name);
	}

	const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));
	const filterLines: string[] = [];
  
	for (const node of nodes) {
		// 获取输入标签
		const inLabels = inputMap[node.id]?.map(label => `[${label}]`).join('') || '';

		// 生成核心滤镜体
		// const core = node.params ? `${node.name}=${node.params}` : node.name;
		const core = '参数参数';

		// 获取输出标签
		const outLabels = outputMap[node.id]?.map(label => `[${label}]`).join('') || '';

		filterLines.push(`${inLabels}${core}${outLabels}`);
	}

	return filterLines.join('; ');
}
  