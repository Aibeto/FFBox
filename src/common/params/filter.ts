import { FilterLine, FilterNode } from '@common/types';

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
