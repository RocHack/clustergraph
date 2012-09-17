var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');

// remove duplicates from an array
function uniq(arr) {
	return arr.filter(function (el, i) {
		return arr.indexOf(el, i + 1) == -1;
	});
}

// scraping
function get(u, postData, cb) {
	//return fs.readFile("asdf.html", function (er, html) {
		//cb("" + html);
	//});

	if (arguments.length == 2) {
		cb = arguments[1];
		postData = null;
	}
	var urlParts = url.parse(u);
	var secure = urlParts.protocol == "https:";
	var options = {
		method: postData ? "POST" : "GET",
		host: urlParts.hostname,
		port: urlParts.port || (secure ? 443 : 80),
		path: urlParts.pathname + (urlParts.search || ''),
		headers: postData && {
			"Content-Length": postData.length,
			"Content-Type": "application/x-www-form-urlencoded",
			"Cookie": "PHPSESSID=vo0s3kid83cj7un6jdtjrc0ho6"
			// todo: fetch cookie separately
		}
	};
	var req = (secure ? https : http).request(options, function (res) {
		var data = '';
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			data += chunk;
		});
		res.on('end', function () {
			cb(data);
		});
	});
	if (postData) {
		req.write(postData);
	}
	req.end();
}

var clusterRe = /(.*?) \((.*?)\)<\/legend><p.*?>(.*?)<\/p>.*?Academic Division:<\/b>(.*?)<.*?Academic Department:<\/b>(.*?)</,
	courseRe = /<td>.*?(Query\.aspx.*?)<td>(.*?)<\/td>/g,
	listingsRe = /Query\.aspx\?id=DARS&dept=(.*?)&cn=(.*?)'/g;

function sanitizeString(str) {
	return str.replace(/\s{3,}/g, ' ')
		.replace(/&#039;/g, "'")
		.replace(/&amp;/g, "&")
		.trim();
}

function getAllClusters(cb) {
	console.log('Getting clusters. ');
	get('https://secure1.rochester.edu/registrar/CSE/searchResults.php',
		'ShowExpired=Hide%20Expired%20Clusters&Division=ALL&Department=ALL',
		function (html) {
			//fs.writeFile("asdf.html", html);

		var clusters = [];
		// Split page into sections, one for each cluster.
		var sections = html.split("<legend id='clusterInformation'>");
		console.log("Got " + sections.length + " clusters.");
		for (var i = 1; i < sections.length; i++) {
			var section = sections[i];

			var m = clusterRe.exec(section);
			if (!m) throw new Error("Cluster section did not match RE. " +
				sections[i]);

			var cluster = {
				title: sanitizeString(m[1]),
				id: m[2],
				description: sanitizeString(m[3]),
				division: m[4].trim(),
				dept: m[5].trim(),
				courses: []
			};
			clusters.push(cluster);

			// Get all the courses in this cluster section
			while (m = courseRe.exec(section)) {
				var course = {
					title: sanitizeString(m[2]),
					listings: []
				};
				cluster.courses.push(course);

				// get and add crosslistings
				var n;
				while (n = listingsRe.exec(m[1])) {
					course.listings.push({
						dept: n[1].trim(),
						cn: n[2].trim()
					});
				}
			}
		}

		clusters.sort(function (a, b) {
			return b.id > a.id;
		});
		cb(clusters);
	});
}

function extractCoursesFromClusters(cb) {
	var courses = [];
	var courseIndexById = {};
	var numCourses = 0;

	// uniqify courses, including crosslists
	function courseToIndex(course) {
		var ids = course.listings.map(function (listing) {
			return listing.dept + ' ' + listing.cn;
		});

		// get first index that has already been seen
		var i = ids.map(function (id) {
			return courseIndexById[id];
		}).filter(Boolean)[0];

		if (i == null) {
			i = courseIndexById[ids[0]] = numCourses++;
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


var args = process.argv;
if (!args[2]) {
	process.stdout.write("Usage: node scrape.js [output.json]\n");
	return;
}

var max = args[3] || 0;
var output = args[2];
//var output = 'courses-clusters.json';
extractCoursesFromClusters(function (data) {
	fs.writeFile(output, JSON.stringify(data), function (err) {
		if (err) throw err;
		console.log('Courses and clusters have been saved to ' + output + '.');
	});
});
