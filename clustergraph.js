// by Charles Lehner

var node,
    link,
	courses,
	clusters,
	all,
	focusNode,
	degree;

var force = d3.layout.force()
    .on("tick", tick)

var vis = d3.select("#chart").append("svg:svg");

d3.json("courses-clusters.json", function(data) {
	courses = data.courses;
	clusters = data.clusters;
	all = courses.concat(clusters);
	onHashChange();
	if (!focusNode) {
		// Start with a random course or cluster
		var n = Math.floor(Math.random() * (courses.length + clusters.length));
		var node = (n >= courses.length) ?
			clusters[n - courses.length] : courses[n];
		click(node);
	}
});

// Set up degree slider
var deg = d3.select("#degrees_value");
var degSlider = d3.select("#degrees_slider")
	.on("change", function () {
		degree = +this.value;
		deg.html(degree);
		sessionStorage.clusterexplorerdegree = degree;
		update();
	});
degree = +sessionStorage.clusterexplorerdegree;
if (isNaN(degree)) degree = +degSlider.attr("value");
else degSlider.attr("value", degree);
deg.html(degree);

function isCourse(node) {
	return !!node.clusters;
}

function isCluster(node) {
	return !!node.courses;
}

function isCollapsed(node) {
	return node.isCollapsed;
}

function isFocus(node) {
	return node == focusNode;
}

function shortTitle(node) {
	return node.clusters ?
		node.dept + " " + node.cn :
		node.title;
		//"";
	return node.clusters ?
		"" : node.title;
}

function longTitle(node) {
	// Cluster names are fine
	if (node.courses) return node.title;
	// Simplify course names
	var t = node.title.split(":");
	return t[0].replace("_", " ") + ":"
		+ t[1].toLowerCase().replace( /(^|\s)([a-z])/g , function (m, p1, p2) {
			return p1 + p2.toUpperCase();
		});
}

function radius(node) {
	return node.clusters ? 4.5 : 7;
}

var allLinks = {};
function getLink(course, cluster) {
	var id = course.id + "|" + cluster.id;
	//console.log(id in allLinks);
	return allLinks[id] || (allLinks[id] = {
		id: id,
		source: course,
		target: cluster
	});
}

var nodeIds = 1;
function nodeId(node) {
	return node.id || (node.id = nodeIds++);
}

// remove duplicates from an array
function uniq(arr) {
	return arr.filter(function (el, i) {
		return arr.indexOf(el, i + 1) == -1;
	});
}

function getDups(arr) {
	var n = 0;
	arr.forEach(function (el, i) {
		n += (arr.indexOf(el, i + 1) != -1);
	});
	return n;
}

function traverse(focus, degree, alreadySeen) {
	if (degree == null) {
		degree = 1;
	}
	var focusId = nodeId(focus);
	var previousDegree = -1; // degree last time this node was hit
	if (!alreadySeen) {
		alreadySeen = {};
	} else if (focusId in alreadySeen) {
		previousDegree = alreadySeen[focusId];
		//return null;
		if (previousDegree > degree) {
			// already traversed past this node
			return null;
		}
	}
	alreadySeen[focusId] = degree;
	var nodes = [],
		links = [];
	if (previousDegree == -1) {
		nodes.push(focus);
	}
	if (degree > 0) {
		focus.isCollapsed = false;
		if (focus.clusters) {
			// node is a course
			focus.clusters.forEach(function (clusterId) {
				var cluster = clusters[clusterId];
				var more = traverse(cluster, degree - 1, alreadySeen);
				if (more) {
					nodes.push.apply(nodes, more.nodes);
					links.push.apply(links, more.links);
					if (previousDegree < 1) {
						// problem.
						//console.log(nodes.indexOf(cluster) != -1);
						var link = getLink(focus, cluster);
						//if (links.indexOf(link) != -1) debugger;
						//console.log(clusterVisited, links.indexOf(link) != -1);
						if (links.indexOf(link) == -1) {
							links.push(link);
						}
					}
				}
			});
		} else if (focus.courses) {
			// node is a cluster
			focus.courses.forEach(function (courseId) {
				var course = courses[courseId];
				var more = traverse(course, degree - 1, alreadySeen);
				if (more) {
					nodes.push.apply(nodes, more.nodes);
					links.push.apply(links, more.links);
					if (previousDegree < 1) {
						var link = getLink(course, focus);
						//if (links.indexOf(link) != -1) debugger;
						//console.log(courseVisited, links.indexOf(link) != -1);
						if (links.indexOf(link) == -1) {
							links.push(link);
						}
					}
				}
			});
		}
	} else {
		focus.isCollapsed = true;
	}
	return {
		nodes: nodes,
		links: links
	};
}

function showAll() {
	var links = [];
}

function resize(resume) {
	var svg = vis.node();
	force.size([
		svg.offsetWidth,
		svg.offsetHeight
	]);
	if (resume !== false)
		force.resume();
}
window.addEventListener("resize", resize, false);

function update() {
	var info = traverse(focusNode, degree);
	var nodes = info.nodes;
	var links = info.links;
	// Remove duplicates. :( Todo: Fix this!
	links = uniq(links);

	// Restart the force layout.
	resize(false);
	force
		.nodes(nodes)
		.links(links)
		.distance(50)
		.charge(-175)
		.start();

	// Update the links…
	link = vis.selectAll("line.link")
		.data(links, function(d) { return d.id; });

	// Enter any new links.
	link.enter().insert("svg:line", ".node")
		.attr("class", "link")
		.attr("x1", function(d) { return d.source.x; })
		.attr("y1", function(d) { return d.source.y; })
		.attr("x2", function(d) { return d.target.x; })
		.attr("y2", function(d) { return d.target.y; })
		.style("opacity", 0)
		.transition()
			.duration(1000)
			.style("opacity", 1);

	// Exit any old links.
	link.exit().remove();

	// Update the nodes…
	node = vis.selectAll("g.node")
		.data(nodes, nodeId)
		.classed("focus", isFocus)
		.classed("collapsed", isCollapsed);

	// Enter any new nodes.
	var newG = node.enter().insert("svg:g")
		.attr("class", "node")
		.classed("course", isCourse)
		.classed("cluster", isCluster)
		.classed("collapsed", isCollapsed)
		.classed("focus", isFocus)
		.call(force.drag);
	newG.style("opacity", 0)
		.transition()
			.duration(1000)
			.style("opacity", 1);
	newG.append("svg:circle")
		.attr("r", radius)
		.on("click", click)
		.on("mouseover", mouseOver)
		.on("mouseout", mouseOut)
	newG.append("svg:text")
        .attr("class", "nodetext")
        .attr("dx", 9)
        .attr("dy", ".35em")
        .text(shortTitle);

	// Exit any old nodes.
	node.exit().remove();
}

function tick() {
	link.attr("x1", function(d) { return d.source.x; })
		.attr("y1", function(d) { return d.source.y; })
		.attr("x2", function(d) { return d.target.x; })
		.attr("y2", function(d) { return d.target.y; });

	node.attr("transform", function(d) {
		return "translate(" + (d.x || 0) + "," + (d.y || 0) + ")";
	});
}

// Change focus on click.
function click(node) {
	focusNode = node;
	updateNodeInfo();
	updateHash();
	// redraw graph
	update();
}

function updateNodeInfo() {
	var d = focusNode;
	var url, info, type;
	if (d.clusters) {
		// Course
		url = "https://cdcs.ur.rochester.edu/Query.aspx?id=DARS&dept=" +
			d.dept + "&cn=" + d.cn;
		info = type = "";
	} else {
		// Cluster
		url = "http://www.rochester.edu/ur-cgi-bin/CCAS/symphony?" +
			"TEMPLATE=clusters3.pkg&expired=no&query=" + d.id;
		type = d.dept + " (" + d.division + ")"
		info = d.description;
	}
	d3.select("#node_title a")
		.text(longTitle(d))
		.attr("href", url);
	d3.select("#node_type")
		.text(type);
	d3.select("#node_info")
		.html(info);
}

// Encode focus node (state) in location hash.
function hashNode(node) {
	return (node.clusters ?
		"#course:" + node.dept + node.cn :
		"#cluster:" + node.id
	).toLowerCase();
}

function nodeByHash(hash) {
	if (hash.indexOf("#course:") == 0) {
		for (var i = 0; i < courses.length; i++) {
			if (hash == hashNode(courses[i])) {
				return courses[i];
			}
		}
	} else if (hash.indexOf("#cluster:") == 0) {
		for (var i = 0; i < clusters.length; i++) {
			if (hash == hashNode(clusters[i])) {
				return clusters[i];
			}
		}
	}
	return null;
}

function updateHash() {
	location.hash = hashNode(focusNode);
}
function onHashChange() {
	var hash = location.hash;
	if (!hash) return;
	var node = nodeByHash(hash);
	if (node) click(node);
	else alert(hash + " could not be found.");
}
window.addEventListener("hashchange", onHashChange, false);

var hoveredNode, hoveredEl;

function mouseOver(node) {
	if (hoveredNode) {
		mouseOut(hoveredNode);
	}
	hoveredNode = node;
	hoveredEl = d3.select(this.parentNode)
		.classed("hover", true);
	var text = hoveredEl.select("text")
		.text(longTitle);
	hoveredEl.insert("svg:rect", "text")
		.attr("class", "label")
        .attr("x", 8)
        .attr("y", "-.5em")
		.attr("height", "1em")
		.attr("width", (text.node().offsetWidth || 0) + 2);
	// bring to front
	vis.node().appendChild(hoveredEl.node());
}

function mouseOut(node) {
	if (hoveredNode == node) {
		hoveredEl.classed("hover", false)
			.select("text")
				.text(shortTitle);
		hoveredEl.select("rect")
			.remove();
		hoveredNode = hoveredEl = null;
	}
}

// debounce, by John Hann
// http://unscriptable.com/index.php/2009/03/20/debouncing-javascript-methods/
// discard close invokations for the last one.
Function.prototype.debounce = function (threshold, execAsap) {
	var func = this, timeout;
	return function debounced() {
		var obj = this, args = arguments;
		function delayed() {
			if (!execAsap)
				func.apply(obj, args);
			timeout = null; 
		}
 
		if (timeout)
			clearTimeout(timeout);
		else if (execAsap)
			func.apply(obj, args);
 
		timeout = setTimeout(delayed, threshold || 100); 
	};
};

var indexed = false;
function makeSearchIndex() {
	if (indexed) return;
	all.forEach(function (node) {
		var title = " " + node.title.toUpperCase().replace('_', ' ');
		// add cluster ids for clusters
		if (node.courses) title += " " + node.id;
		node.snippet = title;
	});
	indexed = true;
}

var windowFocused = true,
	resultsFocused,
	searchFocused;

// Search functionality
var searchResults = d3.select("#search_results");
var results = [];
var activeResult; // highlighted result

function search() {
	makeSearchIndex();

	var query = this.value
		.replace(/^\s+|\s+$/g, '')
		.replace(/\s+/g, ' ')
		.toUpperCase();

	// Get search results
	results = query ? all.filter(function (node) {
		return (node.snippet.indexOf(query) != -1);
	}).map(fitness) : [];

	// Rank search results
	function fitness(node) {
		// points if a word in the query is in the result
		// more points if it is towards the beginning.
		var p = 0;
		query.split(" ").forEach(function (word) {
			var i = node.snippet.split(" ").indexOf(word);
			if (i != -1) {
				p += 1 / i;
			} else {
				i = node.snippet.indexOf(word);
				if (i != -1) {
					p += 1 / i;
				}
			}
		});
		console.log(node.snippet, p);
		node.fitness = p;
		return node;
	}

	// Update search results list
	var result = searchResults.selectAll("li")
		.data(results, nodeId);

	result.enter().append("li")
		.on("mouseover", maybeHighlightResult)
		.on("mousemove", maybeHighlightResult)
		.append("a")
			.attr("href", hashNode)
			.text(longTitle)

	result.exit().remove();

	result.sort(function (a, b) {
		return b.fitness - a.fitness;
	});
}

var prevMouse = {};
function maybeHighlightResult() {
	var x = d3.event.pageX;
	var y = d3.event.pageY;
	var mouseActuallyMoved = (prevMouse.x != x || prevMouse.y != y);
	if (mouseActuallyMoved) {
		highlightResult(this);
	}
	prevMouse = {x: x, y: y};
}

// make a result active
function highlightResult(li) {
	if (activeResult && activeResult != li) {
		activeResult.className = "";
	}
	activeResult = li;
	li.className = "highlight";

	// Scroll the highlighted result into view
	var container = li.parentNode;
	var scroll = null;
	var down = li.offsetTop + li.offsetHeight - container.clientHeight;
	if (down > container.scrollTop) {
		scroll = down;
	} else {
		var up = li.offsetTop;
		if (up < container.scrollTop) {
			scroll = up;
		}
	}
	if (scroll != null) {
		container.scrollTop = scroll;
	}
}

var supportsInputSearch = (function (i) {
	i.setAttribute("type", "search");
	return (i.type == "search");
})(document.createElement("input"));

var searchField = d3.select("#search");
if (supportsInputSearch) {
	searchField.on("search", search);
} else {
	searchField.on("keyup", search.debounce())
};
searchField
	.on("keydown", function () {
		if (!results.length) return;
		var e = d3.event;
		switch(e.which || e.keyCode) {
		case 38: // up
			if (activeResult && activeResult.parentNode) {
				if (activeResult.previousSibling) {
					highlightResult(activeResult.previousSibling);
				} else {
					return;
				}
			} else {
				highlightResult(searchResults.node().lastChild);
			}
		break;
		case 40: // down
			if (activeResult && activeResult.parentNode) {
				if (activeResult.nextSibling) {
					highlightResult(activeResult.nextSibling);
				} else {
					return;
				}
			} else {
				highlightResult(searchResults.node().firstChild);
			}
		break;
		case 13: // enter
			location.href = activeResult.firstChild.href;
			this.blur();
		}
	})
	.on("focus", function () {
		searchFocused = true;
		updateResultsFocus();
	})
	.on("blur", function () {
		searchFocused = false;
		// delay because on window blur, input blur fires first
		setTimeout(updateResultsFocus, 10);
	});

function updateResultsFocus() {
	// Don't close the results list on blur if:
	// 1. focus has left the window, or
	// 2. focus has gone to a list item.
	var visible = (searchFocused || !windowFocused || resultsFocused);
	searchResults.style("display", visible ? "block" : "none");
}

d3.select(window)
	.on("blur", function () {
		windowFocused = false;
	})
	.on("focus", function () {
		windowFocused = true;
		updateResultsFocus();
	});

searchResults
	.on("mouseup", function () {
		resultsFocused = false;
		updateResultsFocus();
	})
	.on("mousedown", function () {
		resultsFocused = true;
		updateResultsFocus();
	});

// About screen
var about = d3.select("#about");
d3.select("#about_link").on("click", function() {
	about.style("display", "block");
	d3.event.preventDefault();
});
d3.select("#close_about").on("click", function () {
	about.style("display", "none");
});
