/* MEMO
	BackGround(Event) Page = 後ろで動いているページ（権限強い、DOMアクセス不可）
	ContentScripts = 指定したドメインで読み込まれる追加JS（権限弱い、DOMアクセス可）
	BrowserAction = タスクバーから実行されるポップアップ（権限普通、DOMアクセス不可）
	http://www.apps-gcp.com/calendar-extension/
*/

/**
 * 日付をフォーマットする
 * @param  {Date}   date     日付
 * @param  {String} [format] フォーマット
 * @return {String}          フォーマット済み日付
 * http://qiita.com/osakanafish/items/c64fe8a34e7221e811d0
 */
var formatDate = function (date, format) {
	if (!format) format = 'YYYY-MM-DD hh:mm:ss.SSS';
	format = format.replace(/YYYY/g, date.getFullYear());
	format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
	format = format.replace(/DD/g, ('0' + date.getDate()).slice(-2));
	format = format.replace(/hh/g, ('0' + date.getHours()).slice(-2));
	format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
	format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
	if (format.match(/S/g)) {
		var milliSeconds = ('00' + date.getMilliseconds()).slice(-3);
		var length = format.match(/S/g).length;
		for (var i = 0; i < length; i++) format = format.replace(/S/, milliSeconds.substring(i, i + 1));
	}
	return format;
};

var google = new OAuth2('google', {
	client_id: '339913519683-57jlk8sr061jii97vi75aheiv0o3aoq6.apps.googleusercontent.com',
	client_secret: 'WOmWGKStSCaTw7jCXYG4U4yS',
	api_scope: 'https://www.googleapis.com/auth/calendar'
});

$(document).ready(function(){
	$(".js-storage").each(function() {
		var name = $(this).attr("name");

		if ( localStorage.getItem(name) ) {
			$(this).val( localStorage.getItem(name) );
		}
	});

	$(".js-storage").blur(function() {
		var name = $(this).attr("name");

		localStorage.setItem(name, $(this).val());
	});

	//カレンダーリストの取得
	google.authorize(function() {
		$.ajax({
			type: "GET",
			url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=owner",
			dataType: "json",
			headers: {
				'Authorization': 'Bearer ' + google.getAccessToken()
			}
		})
		.done(function(data, statusText, jqXHR) {
			var list = data.items;

			for (var i = 0; i < list.length; i++) {
				$("#base_ids").append($('<option>').html(list[i].summary).val(list[i].id));
				$("#target_ids").append($('<option>').html(list[i].summary).val(list[i].id));
			}

			// 前回選択したものを復元する
			if ( localStorage.getItem("base_ids") ) {
				$("#base_ids").val( localStorage.getItem("base_ids") );
			}
			if ( localStorage.getItem("target_ids") ) {
				$("#target_ids").val( localStorage.getItem("target_ids") );
			}

		})
		.fail(function(jqXHR, statusText, errorThrown) {
			if ( jqXHR.status === 401 ) {
				chrome.identity.removeCachedAuthToken({
					'token': access_token
				},
				function () {
					alert("無効なアクセストークンを削除しました。再度認証を実施してください。");
				});
			} else {
				var data = JSON.parse(xhr.responseText);
				alert("カレンダーリストの取得に失敗しました。リロードしてください");
			}
		});
	});

	// 日付の初期値を設定
	$("#date").val(formatDate( new Date, "YYYY-MM-DD"));

	// 元のカレンダーからイベントを取得
	$("#convert").click(function() {
		var date = $("#date").val();
		var baseCalendarId = $("#base_ids").val();
		var targetCalendarId = $("#target_ids").val();

		google.authorize(function() {
			var timeMin = encodeURIComponent(formatDate( new Date(date), "YYYY-MM-DDT00:00:00.000+09:00"));
			var timeMax = encodeURIComponent(formatDate( new Date(date), "YYYY-MM-DDT23:59:59.000+09:00"));

			$.ajax({
				type: "GET",
				url: "https://www.googleapis.com/calendar/v3/calendars/" + baseCalendarId + "/events?singleEvents=true&orderBy=startTime&timeMin=" + timeMin + "&timeMax=" + timeMax + "&timeZone=Asia/Tokyo",

				dataType: "json",
				headers: {
					'Authorization': 'Bearer ' + google.getAccessToken()
				}
			})
			.done(function(data) {
				var items = data.items;
				var stash = "";

				// カレンダーを全件コピー
				for ( var i=0; i < items.length; i++ ) {
					var item = items[i];

					// 全日対象のイベントは除外
					if ( new Date(item.start.dateTime).toString() === "Invalid Date" ) {
						continue;
					}

					$.ajax({
						type: "POST",
						url: "https://www.googleapis.com/calendar/v3/calendars/" + targetCalendarId + "/events",
						contentType: 'application/json',
						dataType: "json",
						data: JSON.stringify({
							"description": "description",
							"summary": item.summary,
							"transparency": item.transparency,
							"status": item.status,
							"start" : {"dateTime": item.start.dateTime, "timeZone": "Asia/Tokyo" },
							"end": {"dateTime": item.end.dateTime, "timeZone": "Asia/Tokyo" }
						}),
						headers: {
							'Authorization': 'Bearer ' + google.getAccessToken()
						},
						tmpItem: item
					})
					.done(function(item) {
						$("#buff").text( $("#buff").text() + "【" + item.summary + "】をコピーしました" + "\n");
					})
					.error(function(item,b) {
						// APIの不具合対応用のfix
						$.ajax({
							type: "POST",
							url: "https://www.googleapis.com/calendar/v3/calendars/" + targetCalendarId + "/events",
							contentType: 'application/json',
							dataType: "json",
							data: JSON.stringify({
								"description": "description",
								"summary": this.tmpItem.summary + "_c",
								"transparency": this.tmpItem.transparency,
								"status": this.tmpItem.status,
								"start" : {"dateTime": this.tmpItem.start.dateTime },
								"end": {"dateTime": this.tmpItem.end.dateTime }
							}),
							headers: {
								'Authorization': 'Bearer ' + google.getAccessToken()
							}
						})
						.done(function(item) {
							$("#buff").text( $("#buff").text() + "【" + item.summary + "】をコピーしました" + "\n");
						});
					});
				}
			});
		});
	});
});