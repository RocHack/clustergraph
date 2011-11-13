var http = require('http');
var url = require('url');
var fs = require('fs');

// remove duplicates from an array
function uniq(arr) {
	return arr.filter(function (el, i) {
		return arr.indexOf(el, i + 1) == -1;
	});
}

// scraping

function get(u, end_sentinel, cb) {
	if (arguments.length == 2) {
		cb = arguments[1];
		end_sentinel = null;
	}
	var urlParts = url.parse(u);
	var options = {
		host: urlParts.hostname,
		port: urlParts.port || 80,
		path: urlParts.pathname + (urlParts.search || '')
	};
	var req = http.get(options, function (res) {
		var data = '';
		res.on('data', function (chunk) {
			if (end_sentinel && ((data + chunk).indexOf(end_sentinel) != -1)) {
				res.removeAllListeners('data');
				res.removeAllListeners('end');
				cb(data);
			} else {
				data += chunk;
			}
		});
		res.on('end', function () {
			cb(data);
		});
	});
}

/* posting to couchdb */

function putDoc(doc, dbUrl, cb) {
	var urlParts = url.parse(dbUrl);
	var options = {
		host: urlParts.hostname,
		port: urlParts.port || 80,
		path: urlParts.pathname + "/" + doc._id,
		method: String(doc._id) ? "PUT" : "POST"
	};
	var req = http.request(options, function (res) {
		res.setEncoding('utf8');
		cb(res.statusCode);
	});
	req.on('error', function (e) {
		cb(e);
	});
	req.write(JSON.stringify(doc));
	req.end();
}

/* Scraping stuff */
var school = {
	getDepartments: function (cb) {
		get('http://rochester.edu/College/CCAS/clusters/cluster_directory7.html', function (html) {
			var depts = [];
			var re = /"(\/ur-cgi-bin\/CCAS\/symphony\?.*?)"/g, m;
			while (m = re.exec(html)) {
				var deptPath = m[1].replace(/&amp;/g, '&')
					// fix broken links
					.replace('N1CSC', 'N4CSC')
					.replace(/department=(.*?)&query=&/g, 'query=$1&bydept=yes&')
				depts.push(new Department(deptPath));
			}
			cb(depts);
		});
	},
	getClusterIds: function (cb) {
		var waiting = 0;
		var allClusterIds = [];
		school.getDepartments(function (departments) {
			console.log('Got departments: ' + departments.length);
			//departments = departments.slice(0, 3);
			departments.forEach(function (dept, i) {
				//console.log('Getting cluster ids for dept ' + i);
				waiting++;
				dept.getClusterIds(function (clusterIds) {
					waiting--;
					var progress = ((1 - waiting / departments.length) * 100).toFixed(1);
					console.log('Getting cluster ids: ' + progress + "%");
					allClusterIds.push.apply(allClusterIds, clusterIds);
					if (waiting == 0) {
						cb(uniq(allClusterIds));
					}
				});
			});
		});
	}
};

function Department(path) {
	this.url = 'http://rochester.edu' + path;
}
Department.prototype = {
	getClusterIds: function (cb) {
		get(this.url, '<h3>Related clusters:</h3>', function (html) {
			var clusterIds = [];
			var re = /<b>(.*?)<\/a> <font size=2>\((.*?) ?\)<\/font>/g, m;
			while (m = re.exec(html)) {
				clusterIds.push(m[2]);
			}
			// remove duplicates
			cb(uniq(clusterIds));
		});
	}
};

function Cluster(clusterId, cb) {
	this.courses = [];

	get('http://www.rochester.edu/ur-cgi-bin/CCAS/symphony?TEMPLATE=clusters3.pkg&expired=no&query=' + clusterId, function (html) {
		var courses = [];
		var re = /dept=\r(.*?)&cn=(.*?)'>(.*?)<\/td>/g, m;
		while (m = re.exec(html)) {
			var course = {
				dept: m[1].trim(),
				cn: m[2].trim(),
				title: m[3].replace('</a>', '').trim(),
			};
			courses.push(course);
		}
		re = /<h2>(.*?) <font[\s\S]*?Dept\/Division<\/b>\n<blockquote>(.*?)\/(.*?)<\/blockquote>\n<b>Description:<\/b>\n<blockquote>(.*?)\s*<\/blockquote>/;
		m = re.exec(html);
		if (!m) {
			// probably an expired cluster
			return cb(null);
			//throw new Error("Unable to process cluster info for " + clusterId + ".");
		}
		var cluster = {
			id: clusterId,
			courses: courses,
			title: m[1].trim(),
			dept: m[2].trim(),
			division: m[3].trim(),
			description: m[4].trim()
		};
		cb(cluster);
	});
}

var debug = 0;

function getAllClusters(cb) {
	if (debug) {
		fs.readFile('clusters.json', function (err, data) {
			if (err) throw err;
			cb(JSON.parse(data));
		});
		return;
	}
	var waiting = 0;
	var clusters = [];
	school.getClusterIds(function (clusterIds) {
		console.log('Got cluster ids:', clusterIds);
		clusterIds.forEach(function (clusterId) {
			//console.log('Getting cluster ' + clusterId);
			waiting++;
			var cluster = new Cluster(clusterId, function (cluster) {
				if (cluster) clusters.push(cluster);
				waiting--;
				var progress = ((1 - waiting / clusterIds.length) * 100).toFixed(1);
				console.log('Getting clusters: ' + progress + '%');
				if (waiting == 0) {
					cb(clusters);
				}
			});
		});
	});
}

function saveClusters(clusters) {
	var output = 'clusters.json';
	fs.writeFile(output, JSON.stringify(clusters), function (err) {
		if (err) throw err;
		console.log('Clusters have been saved to ' + output + '.');
	});
}

// getAllClusters(saveClusters);

function extractCoursesFromClusters(cb) {
	var courses = [];
	var courseIndexById = {};
	var numCourses = 0;
	function courseToIndex(course) {
		var id = course.dept + ' ' + course.cn;
		var i = courseIndexById[id];
		if (i == null) {
			i = courseIndexById[id] = numCourses++;
			courses[i] = course;
			course.clusters = [];
		}
		return i;
	}
	getAllClusters(function (clusters) {
		var clustersNice = clusters.map(function (c, clusterI) {
			c.courses.forEach(function (course) {
				courses[courseToIndex(course)].clusters.push(clusterI);
			});
			return {
				id: c.id,
				title: c.title,
				dept: c.dept,
				division: c.division,
				description: c.description,
				courses: c.courses.map(courseToIndex)
			};
		});
		cb({
			clusters: clustersNice,
			courses: courses
		});
	});
}

extractCoursesFromClusters(function (data) {
	var output = 'courses-clusters.json';
	fs.writeFile(output, JSON.stringify(data), function (err) {
		if (err) throw err;
		console.log('Courses and clusters have been saved to ' + output + '.');
	});
});

// save a cluster as a doc to the db
function saveCluster(cluster) {
	//cluster._id = cluster.id;
	//putDoc(cluster, 'http://localhost:5984/clusterland', function (result) {
}

/*
var args = process.argv;
if (!args[2]) {
	process.stdout.write("Usage: node scrape.js output.json [max_departments]\n");
} else {
	var max = args[3] || 0;
	var output = args[2];
	getCourseAndClusterDocs(max, function (data) {
		console.log("Saving data...");
		fs.writeFile(output, JSON.stringify(data), function (err) {
			if (err) throw err;
			console.log('Docs have been saved to ' + output + '.');
		});
	});
}
*/
